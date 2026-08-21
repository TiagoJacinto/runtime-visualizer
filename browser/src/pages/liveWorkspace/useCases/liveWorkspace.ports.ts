import type { AnalysisGateway } from "../../../shared/api/analysisGateway";
import type { LiveWorkspaceState } from "./liveWorkspace.types";
export type WorkspaceController = {
  getState(): LiveWorkspaceState;
  subscribe(listener: (state: LiveWorkspaceState) => void): () => void;
  selectFile(file: string): void;
  selectProcedure(name: string): void;
  retry(): void;
  dispose(): void;
};
export type LiveWorkspacePorts = { analysis: AnalysisGateway };
