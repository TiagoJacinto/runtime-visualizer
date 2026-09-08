import type { AnalysisGatewayPort } from "../../../shared/api/analysisGateway";
import type { ExecutionGatewayPort } from "../../../shared/api/executionGateway";
import type { WorkspaceEventsGatewayPort } from "../../../shared/api/workspaceEventsGateway";
import type { WorkspacePreferences } from "../../../shared/api/workspacePreferences";
import type { RetryScheduler } from "../../../shared/retry/retryScheduler";
import type { LiveWorkspaceEvent } from "./liveWorkspace.reducer";
import type { LiveWorkspaceState } from "./liveWorkspace.types";

export type ExecutionPort = ExecutionGatewayPort;

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
  analysis: AnalysisGatewayPort;
  execution: ExecutionPort;
  workspaceEvents: WorkspaceEventsGatewayPort;
  preferences?: WorkspacePreferences;
  retry?: RetryScheduler;
};
