import type {
  ActiveExecution,
  ExecutionUpdate,
  RevisionKey,
} from "../../../../packages/contracts/src/index.ts";

export type TerminalExecutionStatus = Exclude<
  ExecutionUpdate["status"],
  "Running"
>;

export type StartExecutionState = {
  readonly executionId: string;
  readonly displayNumber: number;
  readonly scope: RevisionKey;
  readonly startedAt: string;
};

/** Owns the state transitions and invariants of one Execution. */
export class Execution {
  private readonly initial: StartExecutionState;
  private currentNodeId: string | null = null;
  private status: ExecutionUpdate["status"] = "Running";

  constructor(initial: StartExecutionState) {
    this.initial = initial;
  }

  get executionId(): string {
    return this.initial.executionId;
  }

  snapshot(): ActiveExecution {
    this.ensureRunning();
    return {
      ...this.initial,
      status: "Running",
      currentNodeId: this.currentNodeId,
    };
  }

  advanceTo(nodeId: string): ExecutionUpdate {
    this.ensureRunning();
    this.currentNodeId = nodeId;
    return this.runningUpdate();
  }

  finish(status: TerminalExecutionStatus, error?: string): ExecutionUpdate {
    this.ensureRunning();
    this.status = status;
    return {
      ...this.initial,
      status,
      currentNodeId: this.currentNodeId,
      ...(error === undefined ? {} : { error }),
      ...(status === "Failed" && this.currentNodeId !== null
        ? { failedNodeId: this.currentNodeId }
        : {}),
    };
  }

  private runningUpdate(): ExecutionUpdate {
    return {
      ...this.initial,
      status: "Running",
      currentNodeId: this.currentNodeId,
    };
  }

  private ensureRunning(): void {
    if (this.status !== "Running") {
      throw new Error("Execution has already reached a terminal Result.");
    }
  }
}
