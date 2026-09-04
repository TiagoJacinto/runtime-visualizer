import type { AnalysisGateway } from "../../../shared/api/analysisGateway";
import type {
  ExecutionGateway,
  ExecutionRequest,
} from "../../../shared/api/executionGateway";
import type { FileEventsGateway } from "../../../shared/api/fileEventsGateway";
import type { WorkspaceEventsGateway } from "../../../shared/api/workspaceEventsGateway";
import type { WorkspacePreferences } from "../../../shared/api/workspacePreferences";
import type { RetryScheduler } from "../../../shared/retry/retryScheduler";
import type { LiveWorkspaceEvent } from "./liveWorkspace.reducer";
import type { LiveWorkspaceState } from "./liveWorkspace.types";

/** Test-only legacy stream shape; production execution uses shared SSE. */
export type LegacyExecutionStream = {
  executionId: string;
  events: AsyncIterable<unknown>;
  cancel(): void;
};

export type ExecutionPort = {
  start(
    input: ExecutionRequest,
    signal?: AbortSignal,
  ): Promise<string | LegacyExecutionStream>;
  list?: ExecutionGateway["list"];
  cancel?: ExecutionGateway["cancel"];
};

export type WorkspaceController = {
  getState(): LiveWorkspaceState;
  dispatch(intent: LiveWorkspaceEvent): void;
  start(): void;
  subscribe(listener: (state: LiveWorkspaceState) => void): () => void;
  selectFile(file: string): void;
  selectProcedure(procedureId: string): void;
  selectRevision(key: LiveWorkspaceState["selectedScope"]): void;
  setImportsVisible(visible: boolean): void;
  focus(target: LiveWorkspaceState["focus"]): void;
  runProcedure(): void;
  selectExecution(executionId: string): void;
  armCancel(executionId: string): void;
  confirmCancel(executionId: string): void;
  clearCompleted(): void;
  retry(): void;
  dispose(): void;
};

export type LiveWorkspacePorts = {
  analysis: AnalysisGateway;
  execution: ExecutionPort;
  fileEvents?: FileEventsGateway;
  workspaceEvents?: WorkspaceEventsGateway;
  preferences?: WorkspacePreferences;
  retry?: RetryScheduler;
};
