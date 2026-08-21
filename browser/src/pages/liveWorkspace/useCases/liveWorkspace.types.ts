import type { AnalysisResponse } from "@runtime-visualizer/contracts";
export type WorkspaceStatus = "loading" | "ready" | "empty" | "error";
export type ConnectionStatus = "connected" | "reconnecting";
export type ExecutionStatus = "running" | "succeeded" | "failed" | "interrupted";
export type ExecutionRecord = {
  executionId: string;
  file: string;
  procedure: string | null;
  revision: string;
  status: ExecutionStatus;
  currentNodeId: string | null;
  error: string | null;
};
export type LiveWorkspaceState = {
  status: WorkspaceStatus;
  files: string[];
  selectedFile: string | null;
  selectedProcedure: string | null;
  analysis: AnalysisResponse | null;
  snapshots: Readonly<Record<string, AnalysisResponse>>;
  executions: readonly ExecutionRecord[];
  selectedExecutionId: string | null;
  error: string | null;
  connection: ConnectionStatus;
  queuedRevision: string | null;
  fileDeleted: boolean;
};
export const initialLiveWorkspaceState: LiveWorkspaceState = {
  status: "loading",
  files: [],
  selectedFile: null,
  selectedProcedure: null,
  analysis: null,
  snapshots: {},
  executions: [],
  selectedExecutionId: null,
  error: null,
  connection: "connected",
  queuedRevision: null,
  fileDeleted: false,
};

export function snapshotKey(analysis: AnalysisResponse): string {
  return `${analysis.file}:${analysis.procedure.id}:${analysis.revision}`;
}
