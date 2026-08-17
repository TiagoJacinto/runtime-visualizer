import type { AnalysisResponse } from "@runtime-visualizer/contracts";
export type WorkspaceStatus = "loading" | "ready" | "empty" | "error";
export type LiveWorkspaceState = {
  status: WorkspaceStatus;
  files: string[];
  selectedFile: string | null;
  selectedProcedure: string | null;
  analysis: AnalysisResponse | null;
  error: string | null;
};
export const initialLiveWorkspaceState: LiveWorkspaceState = { status: "loading", files: [], selectedFile: null, selectedProcedure: null, analysis: null, error: null };
