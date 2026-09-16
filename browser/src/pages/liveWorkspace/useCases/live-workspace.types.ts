import type {
  ActiveExecution,
  AnalysisResponse,
  RevisionKey,
  RevisionSummary,
} from "@runtime-visualizer/contracts";

export type AnalysisPaneState =
  | {
      status: "empty";
    }
  | {
      status: "loading";
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

/**
 * Local interaction state only. Request-response resources live in the query
 * cache and are combined with this state at the rendering boundary.
 */
export interface LiveWorkspaceState {
  selectedScope: RevisionKey | null;
  focus: FocusTarget | null;
  contextTab: "scope" | "runs";
  cancellation: CancellationState;
  connectionState: WorkspaceConnectionState;
  notifications: readonly WorkspaceNotification[];
  importsVisible: boolean;
  errorMessage: string | null;
  completedExecutions: readonly ExecutionRecord[];
  selectedExecutionId: string | null;
  queuedRevision: string | null;
  fileDeleted: boolean;
}

export interface WorkspaceResourceState {
  files: readonly string[];
  analysis: AnalysisResponse | null;
  analysisStatus: "loading" | "ready" | "failed" | "empty";
  analysisError: string | null;
  revisions: readonly RevisionSummary[];
  activeExecutions: readonly ExecutionRecord[];
}

/** Ephemeral view model composed from local interaction state and query data. */
export interface LiveWorkspaceView extends LiveWorkspaceState {
  files: readonly string[];
  analysis: AnalysisResponse | null;
  revisions: readonly RevisionSummary[];
  activeExecutions: readonly ExecutionRecord[];
  executions: readonly ExecutionRecord[];
  pane: AnalysisPaneState;
  status: "loading" | "ready" | "empty" | "error";
  selectedFile: string | null;
  selectedProcedure: string | null;
  error: string | null;
  connection: "connected" | "reconnecting";
}

export const initialLiveWorkspaceState: LiveWorkspaceState = {
  cancellation: { armedExecutionId: null, pendingById: {} },
  completedExecutions: [],
  connectionState: { cursor: null, status: "connected" },
  contextTab: "scope",
  errorMessage: null,
  fileDeleted: false,
  focus: null,
  importsVisible: true,
  notifications: [],
  queuedRevision: null,
  selectedExecutionId: null,
  selectedScope: null,
};

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
