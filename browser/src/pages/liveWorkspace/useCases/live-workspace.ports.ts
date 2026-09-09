import type { AnalysisGatewayPort } from "../../../shared/api/analysis-gateway";
import type { ExecutionGatewayPort } from "../../../shared/api/execution-gateway";
import type { WorkspaceEventsGatewayPort } from "../../../shared/api/workspace-events-gateway";
import type { WorkspacePreferences } from "../../../shared/api/workspace-preferences";
import type { RetryScheduler } from "../../../shared/retry/retry-scheduler";
import type { LiveWorkspaceEvent } from "./live-workspace.reducer";
import type { LiveWorkspaceState } from "./live-workspace.types";

export type ExecutionPort = ExecutionGatewayPort;

export interface WorkspaceController {
  getState: () => LiveWorkspaceState;
  dispatch: (intent: LiveWorkspaceEvent) => void;
  start: () => void;
  subscribe: (listener: (state: LiveWorkspaceState) => void) => () => void;
  selectFile: (file: string) => void;
  selectProcedure: (procedureId: string) => void;
  selectRevision: (key: LiveWorkspaceState["selectedScope"]) => void;
  setImportsVisible: (visible: boolean) => void;
  focus: (target: LiveWorkspaceState["focus"]) => void;
  runProcedure: () => void;
  selectExecution: (executionId: string) => void;
  armCancel: (executionId: string) => void;
  confirmCancel: (executionId: string) => void;
  clearCompleted: () => void;
  retry: () => void;
  dispose: () => void;
}

export interface LiveWorkspacePorts {
  analysis: AnalysisGatewayPort;
  execution: ExecutionPort;
  workspaceEvents: WorkspaceEventsGatewayPort;
  preferences?: WorkspacePreferences;
  retry?: RetryScheduler;
}
