import type { AnalysisSnapshot, RevisionKey } from "../analysis/index.ts";
import type { ProjectId } from "../project-files/index.ts";
import type { RevisionHistory } from "../revision-history/index.ts";
import { LocalExecution } from "./local-execution.ts";

export type { AnalysisSnapshot } from "../analysis/index.ts";

export interface ActiveExecution {
  readonly executionId: string;
  readonly displayNumber: number;
  readonly scope: RevisionKey;
  readonly startedAt: string;
  readonly status: "Running";
  readonly currentNodeId: string | null;
}

export interface ExecutionUpdate {
  readonly executionId: string;
  readonly displayNumber: number;
  readonly scope: RevisionKey;
  readonly status: "Running" | "Succeeded" | "Failed" | "Cancelled";
  readonly currentNodeId: string | null;
  readonly error?: string;
  readonly failedNodeId?: string;
}
export type ExecutionProcedure = NonNullable<
  NonNullable<AnalysisSnapshot["cfg"]>["procedures"]
>[number];

export interface ExecutionWorkerRequest {
  readonly filePath: string;
  readonly functionName?: string;
  readonly procedure: ExecutionProcedure;
  readonly source: string;
}

export type ExecutionWorkerReply =
  | { readonly type: "node"; readonly nodeId: string }
  | {
      readonly type: "result";
      readonly status: "Succeeded" | "Failed";
      readonly error?: string;
    };

export interface ExecutionWorkerResult {
  readonly status: "Succeeded" | "Failed" | "Cancelled";
  readonly error?: string;
}

export interface ExecutionWorkerLike {
  onError: (listener: (message: string) => void) => () => void;
  onMessage: (listener: (message: ExecutionWorkerReply) => void) => () => void;
  postMessage: (request: ExecutionWorkerRequest) => void;
  terminate: () => void;
}

export interface LocalExecutionPort {
  cancel: (executionId: string) => Promise<void>;
  dispose: () => void;
  list: () => Promise<readonly ActiveExecution[]>;
  start: (scope: RevisionKey) => Promise<string>;
  subscribe: (listener: (update: ExecutionUpdate) => void) => () => void;
}

export type LocalExecutionCommands = Pick<
  LocalExecutionPort,
  "cancel" | "list" | "start"
>;
export type LocalExecutionUpdates = Pick<LocalExecutionPort, "subscribe">;

export interface LocalExecutionOptions {
  readonly createWorker?: () => ExecutionWorkerLike;
  readonly executionTimeoutMs?: number;
  readonly now?: () => Date;
}

export const createLocalExecution = (
  history: RevisionHistory,
  projectId: ProjectId,
  options?: LocalExecutionOptions
): LocalExecutionPort => new LocalExecution(history, projectId, options);
