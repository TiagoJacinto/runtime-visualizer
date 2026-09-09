import type {
  AnalysisResponse,
  ActiveExecution,
  RevisionKey,
  RevisionSummary,
} from "@runtime-visualizer/contracts";

type ProcedureResource = AnalysisResponse["procedures"][number];
export type AnalysisPaneState =
  | {
      status: "empty";
    }
  | {
      status: "loading";
      requestId: string;
      previous?: AnalysisResponse;
    }
  | {
      status: "ready";
      value: AnalysisResponse;
    }
  | {
      status: "failed";
      previous?: AnalysisResponse;
      error: string;
    };
export interface FocusTarget {
  scope: RevisionKey;
  nodeId: string;
  origin: "graph" | "source" | "failure";
}
export interface CancellationState {
  armedExecutionId: string | null;
  pendingById: Readonly<Record<string, true>>;
}
export interface WorkspaceNotification {
  id: string;
  message: string;
  level: "info" | "error";
}
export interface WorkspaceConnectionState {
  status: "connected" | "reconnecting";
  cursor: number | null;
}
export type ExecutionStatus = "running" | "succeeded" | "failed" | "cancelled";
/** Browser projection of a server-owned execution. `scope` is authoritative. */
export interface ExecutionRecord {
  executionId: string;
  displayNumber?: number;
  scope: RevisionKey;
  startedAt?: string;
  status: ExecutionStatus;
  currentNodeId: string | null;
  error: string | null;
  failedNodeId?: string;
  /** Transitional display fields used by the existing graph and inspector. */
  file: string;
  procedure: string | null;
  revision: string;
}
export interface LiveWorkspaceState {
  files: readonly string[];
  proceduresByFile: Readonly<Record<string, readonly ProcedureResource[]>>;
  selectedScope: RevisionKey | null;
  revisionsByScope: Readonly<Record<string, readonly RevisionSummary[]>>;
  pane: AnalysisPaneState;
  activeExecutionsById: Readonly<Record<string, ExecutionRecord>>;
  completedExecutions: readonly ExecutionRecord[];
  focus: FocusTarget | null;
  contextTab: "scope" | "runs";
  cancellation: CancellationState;
  connectionState: WorkspaceConnectionState;
  notifications: readonly WorkspaceNotification[];
  importsVisible: boolean;
  errorMessage: string | null;
  // Derived projections retained while the pre-shell page is migrated.
  status: "loading" | "ready" | "empty" | "error";
  selectedFile: string | null;
  selectedProcedure: string | null;
  analysis: AnalysisResponse | null;
  snapshots: Readonly<Record<string, AnalysisResponse>>;
  executions: readonly ExecutionRecord[];
  selectedExecutionId: string | null;
  error: string | null;
  connection: "connected" | "reconnecting";
  queuedRevision: string | null;
  fileDeleted: boolean;
}
export const initialLiveWorkspaceState: LiveWorkspaceState = {
  activeExecutionsById: {},
  analysis: null,
  cancellation: { armedExecutionId: null, pendingById: {} },
  completedExecutions: [],
  connection: "connected",
  connectionState: { cursor: null, status: "connected" },
  contextTab: "scope",
  error: null,
  errorMessage: null,
  executions: [],
  fileDeleted: false,
  files: [],
  focus: null,
  importsVisible: true,
  notifications: [],
  pane: { status: "empty" },
  proceduresByFile: {},
  queuedRevision: null,
  revisionsByScope: {},
  selectedExecutionId: null,
  selectedFile: null,
  selectedProcedure: null,
  selectedScope: null,
  snapshots: {},
  status: "loading",
};
export const scopeKey = (
  scope: Pick<RevisionKey, "file" | "procedureId">
): string => `${scope.file}\0${scope.procedureId}`;
export const snapshotKey = (
  analysis: Pick<AnalysisResponse, "file" | "procedureId" | "revision">
): string => `${analysis.file}\0${analysis.procedureId}\0${analysis.revision}`;
export const executionRecordFromActive = (
  execution: ActiveExecution
): ExecutionRecord => ({
  currentNodeId: execution.currentNodeId,
  displayNumber: execution.displayNumber,
  error: null,
  executionId: execution.executionId,
  file: execution.scope.file,
  procedure: execution.scope.procedureId,
  revision: execution.scope.revision,
  scope: execution.scope,
  startedAt: execution.startedAt,
  status: "running",
});
