import type { RevisionHistory } from "../../analysis/revisionHistory.ts";
import type {
  RevisionKey,
  ActiveExecution,
  ExecutionUpdate,
} from "../../../../../packages/contracts/src/index.ts";
import { executeProcedure } from "./executeProcedure/runner.ts";
import { ActiveRunRegistry } from "../infra/activeRunRegistry.ts";

export type StartExecution = RevisionKey;
export type CancelResult = "cancelled" | "not-found";
export type ExecutionManagerOptions = {
  readonly executionTimeoutMs?: number;
  readonly now?: () => Date;
  readonly registry?: ActiveRunRegistry;
};
export interface ExecutionManager {
  start(input: StartExecution): Promise<string>;
  listActive(): readonly ActiveExecution[];
  cancel(id: string): CancelResult;
  subscribe(listener: (event: ExecutionUpdate) => void): () => void;
  close(): void;
}

export function createExecutionManager(
  history: RevisionHistory,
  options: ExecutionManagerOptions = {},
): ExecutionManager {
  return new DefaultExecutionManager(history, options);
}

export class DefaultExecutionManager implements ExecutionManager {
  readonly registry: ActiveRunRegistry;
  private readonly controllers = new Map<string, AbortController>();
  private readonly releases = new Map<string, () => void>();
  private readonly listeners = new Set<(event: ExecutionUpdate) => void>();
  private displayNumber = 0;
  private readonly now: () => Date;
  private closed = false;
  constructor(
    private readonly history: RevisionHistory,
    options: ExecutionManagerOptions = {},
  ) {
    this.registry = options.registry ?? new ActiveRunRegistry();
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.executionTimeoutMs ?? 30_000;
  }
  private readonly timeoutMs: number;

  async start(input: StartExecution): Promise<string> {
    if (this.closed) throw new Error("Execution manager is closed.");
    const lease = await this.history.acquire(input);
    if (!lease || !lease.snapshot.cfg) throw new Error("Revision unavailable");
    const executionId = crypto.randomUUID();
    const displayNumber = ++this.displayNumber;
    const active: ActiveExecution = {
      executionId,
      displayNumber,
      scope: input,
      startedAt: this.now().toISOString(),
      status: "Running",
      currentNodeId: null,
    };
    const controller = new AbortController();
    // A stored snapshot is already scoped to the requested Procedure ID; its CFG
    // contains the corresponding executable Procedure (CFG records use names).
    const procedure = lease.snapshot.cfg.procedures?.[0];
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      lease.release();
    };
    this.controllers.set(executionId, controller);
    this.releases.set(executionId, release);
    this.registry.register(active);
    this.publish({ ...active });
    if (!procedure) {
      release();
      this.controllers.delete(executionId);
      this.releases.delete(executionId);
      this.registry.remove(executionId);
      throw new Error("Revision unavailable");
    }
    const functionName =
      input.procedureId === "top-level"
        ? undefined
        : (procedure.name ?? undefined);
    void executeProcedure(
      lease.snapshot.source,
      lease.snapshot.file,
      procedure,
      functionName,
      (nodeId) => this.runningUpdate(executionId, nodeId),
      { timeoutMs: this.timeoutMs, signal: controller.signal },
    )
      .then((result) =>
        this.finish(executionId, result.status, result.error, release),
      )
      .catch((cause: unknown) =>
        this.finish(
          executionId,
          "Failed",
          cause instanceof Error ? cause.message : String(cause),
          release,
        ),
      );
    return executionId;
  }
  listActive(): readonly ActiveExecution[] {
    return this.registry.list();
  }
  cancel(id: string): CancelResult {
    const run = this.registry.get(id);
    if (!run) return "not-found";
    // Remove the run synchronously so Active Runs reflects the accepted
    // cancellation immediately. The worker's eventual Cancelled result is
    // intentionally ignored by finish because the lease is released here.
    this.controllers.get(id)?.abort();
    this.finish(
      id,
      "Cancelled",
      "Execution cancelled.",
      this.releases.get(id) ?? (() => undefined),
    );
    return "cancelled";
  }
  subscribe(listener: (event: ExecutionUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [id, controller] of this.controllers) {
      controller.abort();
      const run = this.registry.get(id);
      if (run)
        this.finish(
          id,
          "Failed",
          "Backend closed.",
          this.releases.get(id) ?? (() => undefined),
        );
    }
    this.listeners.clear();
  }
  private runningUpdate(id: string, nodeId: string): void {
    const run = this.registry.get(id);
    if (!run) return;
    this.registry.update({ ...run, status: "Running", currentNodeId: nodeId });
    this.publish({ ...run, status: "Running", currentNodeId: nodeId });
  }
  private finish(
    id: string,
    status: "Succeeded" | "Failed" | "Cancelled",
    error: string | undefined,
    release: () => void,
  ): void {
    const run = this.registry.get(id);
    if (!run) {
      this.releases.delete(id);
      release();
      return;
    }
    const update: ExecutionUpdate = {
      executionId: id,
      displayNumber: run.displayNumber,
      scope: run.scope,
      status,
      currentNodeId: run.currentNodeId,
      ...(error === undefined ? {} : { error }),
      ...(status === "Failed" && run.currentNodeId
        ? { failedNodeId: run.currentNodeId }
        : {}),
    };
    this.publish(update);
    this.registry.remove(id);
    this.controllers.delete(id);
    this.releases.delete(id);
    release();
  }
  private publish(event: ExecutionUpdate): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* subscribers are isolated */
      }
    }
  }
}
