import type { RevisionKey as WorkspaceRevisionKey } from "../analysis/index.ts";
import type { ProjectId } from "../project-files/index.ts";
import type { RevisionHistory } from "../revision-history/index.ts";
import { runInExecutionWorker } from "./browser-execution-worker.ts";
import type {
  ActiveExecution,
  ExecutionUpdate,
  ExecutionWorkerRequest,
  ExecutionWorkerResult,
  LocalExecutionOptions,
  LocalExecutionPort,
} from "./index.ts";

interface ActiveRun {
  readonly controller: AbortController;
  readonly displayNumber: number;
  readonly executionId: string;
  readonly scope: WorkspaceRevisionKey;
  readonly startedAt: string;
  completion: Promise<void>;
  currentNodeId: string | null;
}

// SAFETY: caught worker failures are normalized at this module boundary.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class LocalExecution implements LocalExecutionPort {
  private readonly active = new Map<string, ActiveRun>();
  private readonly listeners = new Set<(update: ExecutionUpdate) => void>();
  private readonly history: RevisionHistory;
  private readonly projectId: ProjectId;
  private readonly options: LocalExecutionOptions;
  private displayNumber = 0;
  private disposed = false;

  constructor(
    history: RevisionHistory,
    projectId: ProjectId,
    options: LocalExecutionOptions = {}
  ) {
    this.history = history;
    this.projectId = projectId;
    this.options = options;
  }

  async start(scope: WorkspaceRevisionKey): Promise<string> {
    if (this.disposed) {
      throw new Error("Execution module has been disposed.");
    }
    const snapshot = await this.history.load({
      ...scope,
      projectId: this.projectId,
    });
    if (
      snapshot === undefined ||
      snapshot.projectId !== this.projectId ||
      snapshot.file !== scope.file ||
      snapshot.procedureId !== scope.procedureId ||
      snapshot.revision !== scope.revision ||
      snapshot.cfg === null ||
      snapshot.diagnostics.length > 0
    ) {
      throw new Error("Revision unavailable");
    }
    const procedure = snapshot.cfg.procedures?.[0];
    if (procedure === undefined) {
      throw new Error("Revision unavailable");
    }

    const executionId = crypto.randomUUID();
    this.displayNumber += 1;
    const run: ActiveRun = {
      completion: Promise.resolve(),
      controller: new AbortController(),
      currentNodeId: null,
      displayNumber: this.displayNumber,
      executionId,
      scope,
      startedAt: (this.options.now ?? (() => new Date()))().toISOString(),
    };
    const request: ExecutionWorkerRequest = {
      filePath: snapshot.file,
      functionName:
        scope.procedureId === "top-level" ? undefined : procedure.name,
      procedure,
      source: snapshot.source,
    };
    this.active.set(executionId, run);
    this.publish(LocalExecution.update(run, "Running"));
    run.completion = this.run(run, request);
    return executionId;
  }

  list(): Promise<readonly ActiveExecution[]> {
    return Promise.resolve(
      [...this.active.values()].map((run) => ({
        currentNodeId: run.currentNodeId,
        displayNumber: run.displayNumber,
        executionId: run.executionId,
        scope: run.scope,
        startedAt: run.startedAt,
        status: "Running",
      }))
    );
  }

  async cancel(executionId: string): Promise<void> {
    const run = this.active.get(executionId);
    if (run === undefined) {
      return;
    }
    run.controller.abort();
    await run.completion;
  }

  subscribe(listener: (update: ExecutionUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const run of this.active.values()) {
      run.controller.abort();
    }
    this.active.clear();
    this.listeners.clear();
  }

  private async run(
    run: ActiveRun,
    request: ExecutionWorkerRequest
  ): Promise<void> {
    let result: ExecutionWorkerResult;
    try {
      result = await runInExecutionWorker(request, {
        createWorker: this.options.createWorker,
        onNode: (nodeId) => {
          if (!this.active.has(run.executionId)) {
            return;
          }
          run.currentNodeId = nodeId;
          this.publish(LocalExecution.update(run, "Running"));
        },
        signal: run.controller.signal,
        timeoutMs: this.options.executionTimeoutMs,
      });
    } catch (error) {
      result = { error: errorMessage(error), status: "Failed" };
    }
    this.finish(run, result);
  }

  private finish(run: ActiveRun, result: ExecutionWorkerResult): void {
    if (!this.active.delete(run.executionId) || this.disposed) {
      return;
    }
    this.publish(LocalExecution.update(run, result.status, result.error));
  }

  private static update(
    run: ActiveRun,
    status: ExecutionUpdate["status"],
    error?: string
  ): ExecutionUpdate {
    return {
      currentNodeId: run.currentNodeId,
      displayNumber: run.displayNumber,
      error,
      executionId: run.executionId,
      failedNodeId:
        status === "Failed" ? (run.currentNodeId ?? undefined) : undefined,
      scope: run.scope,
      status,
    };
  }

  private publish(update: ExecutionUpdate): void {
    for (const listener of this.listeners) {
      try {
        listener(update);
      } catch {
        // Subscriber failures do not stop execution or other listeners.
      }
    }
  }
}
