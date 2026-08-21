import type { AnalysisGateway } from "../../../shared/api/analysisGateway";
import type { ExecutionGateway } from "../../../shared/api/executionGateway";
import type { FileEventsGateway } from "../../../shared/api/fileEventsGateway";
import type { RetryScheduler } from "../../../shared/retry/retryScheduler";
import type { LiveWorkspaceState } from "./liveWorkspace.types";
export type WorkspaceController = {
  getState(): LiveWorkspaceState;
  start(): void;
  subscribe(listener: (state: LiveWorkspaceState) => void): () => void;
  selectFile(file: string): void;
  selectProcedure(name: string): void;
  runProcedure(): void;
  selectExecution(executionId: string): void;
  clearCompleted(): void;
  retry(): void;
  dispose(): void;
};
export type LiveWorkspacePorts = {
  analysis: AnalysisGateway;
  execution: ExecutionGateway;
  fileEvents?: FileEventsGateway;
  retry?: RetryScheduler;
};
