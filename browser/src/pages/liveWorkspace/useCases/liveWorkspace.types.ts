import type {
  AnalysisResponse,
  ActiveExecution,
  RevisionKey,
  RevisionSummary,
} from "@runtime-visualizer/contracts";

type ProcedureResource = AnalysisResponse["procedures"][number];

export type AnalysisPaneState =
  | { status: "empty" }
  | {
      status: "loading";
      requestId: string;
      previous?: AnalysisResponse;
    }
  | { status: "ready"; value: AnalysisResponse }
  | { status: "failed"; previous?: AnalysisResponse; error: string };

export type FocusTarget = {
  scope: RevisionKey;
  nodeId: string;
  origin: "graph" | "source" | "failure";
};

export type CancellationState = {
  armedExecutionId: string | null;
  pendingById: Readonly<Record<string, true>>;
};

export type WorkspaceNotification = {
  id: string;
  message: string;
  level: "info" | "error";
};

export type WorkspaceConnectionState = {
  status: "connected" | "reconnecting";
  cursor: number | null;
};

export type ExecutionStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "interrupted"
  | "cancelled";

/** Browser projection of a server-owned execution. `scope` is authoritative. */
export type ExecutionRecord = {
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
};

export type LiveWorkspaceState = {
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
};

export const initialLiveWorkspaceState: LiveWorkspaceState = {
  files: [],
  proceduresByFile: {},
  selectedScope: null,
  revisionsByScope: {},
  pane: { status: "empty" },
  activeExecutionsById: {},
  completedExecutions: [],
  focus: null,
  contextTab: "scope",
  cancellation: { armedExecutionId: null, pendingById: {} },
  connectionState: { status: "connected", cursor: null },
  notifications: [],
  importsVisible: true,
  errorMessage: null,
  status: "loading",
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

export function scopeKey(scope: Pick<RevisionKey, "file" | "procedureId">): string {
  return `${scope.file}\0${scope.procedureId}`;
}

export function snapshotKey(
  analysis: Pick<AnalysisResponse, "file" | "procedureId" | "revision">,
): string {
  return `${analysis.file}\0${analysis.procedureId}\0${analysis.revision}`;
}

export function executionRecordFromActive(
  execution: ActiveExecution,
): ExecutionRecord {
  return {
    executionId: execution.executionId,
    displayNumber: execution.displayNumber,
    scope: execution.scope,
    startedAt: execution.startedAt,
    status: "running",
    currentNodeId: execution.currentNodeId,
    error: null,
    file: execution.scope.file,
    procedure: execution.scope.procedureId,
    revision: execution.scope.revision,
  };
}
