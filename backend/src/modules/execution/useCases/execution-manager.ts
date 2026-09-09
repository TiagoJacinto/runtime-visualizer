import type {
  ActiveExecution,
  ExecutionUpdate,
} from "../../../../../packages/contracts/src/index.ts";
import type { RevisionHistory } from "../../analysis/index.ts";
import type { ProcedureCfg } from "../../cfg/index.ts";
import { Execution } from "../execution.ts";
import { ActiveRunRegistry } from "../infra/active-run-registry.ts";
import { executeProcedure } from "./executeProcedure/runner.ts";

const NOOP_RELEASE = (): void => undefined;

export interface StartExecution {
  readonly file: string;
  readonly procedureId: string;
  readonly revision: string;
}
export type CancelResult = "cancelled" | "not-found";
export interface ExecutionManagerOptions {
  readonly executionTimeoutMs?: number;
  readonly now?: () => Date;
  readonly registry?: ActiveRunRegistry;
  readonly execute?: typeof executeProcedure;
}
export interface ExecutionManager {
  start: (input: StartExecution) => Promise<string>;
  listActive: () => readonly ActiveExecution[];
  cancel: (id: string) => CancelResult;
  subscribe: (listener: (event: ExecutionUpdate) => void) => () => void;
  close: () => void;
}
export class DefaultExecutionManager implements ExecutionManager {
  readonly registry: ActiveRunRegistry;
  private readonly controllers = new Map<string, AbortController>();
  private readonly releases = new Map<string, () => void>();
  private readonly listeners = new Set<(event: ExecutionUpdate) => void>();
  private displayNumber = 0;
  private readonly now: () => Date;
  private closed = false;
  private readonly history: RevisionHistory;

  constructor(history: RevisionHistory, options: ExecutionManagerOptions = {}) {
    this.history = history;
    this.registry = options.registry ?? new ActiveRunRegistry();
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.executionTimeoutMs ?? 30_000;
    this.execute = options.execute ?? executeProcedure;
  }
  private readonly timeoutMs: number;
  private readonly execute: typeof executeProcedure;
  async start(input: StartExecution): Promise<string> {
    if (this.closed) {
      throw new Error("Execution manager is closed.");
    }
    const lease = await this.history.acquire(input);
    if (!lease || !lease.snapshot.cfg) {
      throw new Error("Revision unavailable");
    }
    const executionId = crypto.randomUUID();
    this.displayNumber += 1;
    const { displayNumber } = this;
    const execution = new Execution({
      displayNumber,
      executionId,
      scope: input,
      startedAt: this.now().toISOString(),
    });
    const controller = new AbortController();
    // A stored snapshot is already scoped to the requested Procedure ID; its CFG
    // contains the corresponding executable Procedure (CFG records use names).
    const procedure = lease.snapshot.cfg.procedures?.[0];
    let released = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      lease.release();
    };
    this.controllers.set(executionId, controller);
    this.releases.set(executionId, release);
    this.registry.register(execution);
    this.publish(execution.snapshot());
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
    void this.runExecution(
      executionId,
      release,
      lease.snapshot.source,
      lease.snapshot.file,
      procedure,
      functionName,
      controller.signal
    );
    return executionId;
  }
  listActive(): readonly ActiveExecution[] {
    return this.registry.list();
  }
  cancel(id: string): CancelResult {
    const run = this.registry.get(id);
    if (!run) {
      return "not-found";
    }
    // Remove the run synchronously so Active Runs reflects the accepted
    // cancellation immediately. The worker's eventual Cancelled result is
    // intentionally ignored by finish because the lease is released here.
    this.controllers.get(id)?.abort();
    this.finish(
      id,
      "Cancelled",
      "Execution cancelled.",
      this.releases.get(id) ?? NOOP_RELEASE
    );
    return "cancelled";
  }
  subscribe(listener: (event: ExecutionUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const [id, controller] of this.controllers) {
      controller.abort();
      const run = this.registry.get(id);
      if (run) {
        this.finish(
          id,
          "Failed",
          "Backend closed.",
          this.releases.get(id) ?? NOOP_RELEASE
        );
      }
    }
    this.listeners.clear();
  }
  private async runExecution(
    executionId: string,
    release: () => void,
    source: string,
    file: string,
    procedure: ProcedureCfg,
    functionName: string | undefined,
    signal: AbortSignal
  ): Promise<void> {
    try {
      const result = await this.execute(
        source,
        file,
        procedure,
        functionName,
        (nodeId) => this.runningUpdate(executionId, nodeId),
        { signal, timeoutMs: this.timeoutMs }
      );
      this.finish(executionId, result.status, result.error, release);
    } catch (error) {
      this.finish(
        executionId,
        "Failed",
        error instanceof Error ? error.message : String(error),
        release
      );
    }
  }
  private runningUpdate(id: string, nodeId: string): void {
    const execution = this.registry.get(id);
    if (!execution) {
      return;
    }
    this.publish(execution.advanceTo(nodeId));
  }
  private finish(
    id: string,
    status: "Succeeded" | "Failed" | "Cancelled",
    error: string | undefined,
    release: () => void
  ): void {
    const execution = this.registry.get(id);
    if (!execution) {
      this.releases.delete(id);
      release();
      return;
    }
    this.publish(execution.finish(status, error));
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

export const createExecutionManager = (
  history: RevisionHistory,
  options: ExecutionManagerOptions = {}
): ExecutionManager => new DefaultExecutionManager(history, options);
