import type {
  AnalysisResponse,
  RevisionKey,
  RevisionSummary,
  WorkspaceEvent,
} from "@runtime-visualizer/contracts";
import {
  executionRecordFromActive,
  initialLiveWorkspaceState,
  scopeKey,
  snapshotKey,
  type ExecutionRecord,
  type LiveWorkspaceState,
} from "./liveWorkspace.types";
import type { WorkspaceEffect } from "./liveWorkspace.effects";

type ProcedureResource = AnalysisResponse["procedures"][number];
type ExecutionUpdate = Extract<
  WorkspaceEvent,
  { type: "execution-update" }
>["update"];
type FileChangeEvent = Extract<
  WorkspaceEvent,
  { type: "source-change" }
>["change"];

export type LiveWorkspaceEvent =
  | { type: "preferences-loaded"; scope?: RevisionKey; importsVisible: boolean }
  | { type: "files-loaded"; files: readonly string[] }
  | {
      type: "procedures-loaded";
      file: string;
      procedures: readonly ProcedureResource[];
    }
  | { type: "analysis-loading"; key: RevisionKey; requestId: string }
  | {
      type: "analysis-loaded";
      key: RevisionKey;
      requestId: string;
      value: AnalysisResponse;
    }
  | { type: "analysis-failed"; requestId: string; error: string }
  | {
      type: "revisions-loaded";
      scope: { file: string; procedureId: string };
      revisions: readonly RevisionSummary[];
    }
  | { type: "workspace-event"; id: number; event: WorkspaceEvent }
  | { type: "arm-cancel"; executionId: string }
  | { type: "confirm-cancel"; executionId: string }
  | { type: "cancel-failed"; executionId: string; error: string }
  | { type: "select-scope"; key: RevisionKey; requestId?: string }
  | { type: "set-tab"; tab: "scope" | "runs" }
  | { type: "focus"; target: LiveWorkspaceState["focus"] }
  | { type: "set-imports-visible"; visible: boolean }
  | { type: "view-analysis"; key: RevisionKey; value: AnalysisResponse }
  | { type: "clear-completed" };

export type Transition = {
  state: LiveWorkspaceState;
  effects: readonly WorkspaceEffect[];
};

function transition(
  state: LiveWorkspaceState,
  patch: Partial<LiveWorkspaceState>,
  effects: readonly WorkspaceEffect[] = [],
): Transition {
  return { state: project(state, patch), effects };
}

function statusForPane(
  pane: LiveWorkspaceState["pane"],
  files: readonly string[],
): LiveWorkspaceState["status"] {
  if (files.length === 0 && pane.status === "empty") return "empty";
  if (pane.status === "ready") return "ready";
  if (pane.status === "failed") return "error";
  return "loading";
}

function compareExecutions(a: ExecutionRecord, b: ExecutionRecord): number {
  if (a.displayNumber !== undefined && b.displayNumber !== undefined)
    return b.displayNumber - a.displayNumber;
  return (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
}

function project(
  state: LiveWorkspaceState,
  patch: Partial<LiveWorkspaceState>,
): LiveWorkspaceState {
  const next = { ...state, ...patch };
  const active = Object.values(next.activeExecutionsById).sort(
    compareExecutions,
  );
  const completed = [...next.completedExecutions].sort(compareExecutions);
  let analysis: AnalysisResponse | null = null;
  if (next.pane.status === "ready") analysis = next.pane.value;
  else if (next.pane.status === "loading" || next.pane.status === "failed")
    analysis = next.pane.previous ?? null;
  const error =
    next.errorMessage ??
    (next.pane.status === "failed" ? next.pane.error : null);
  return {
    ...next,
    status: statusForPane(next.pane, next.files),
    selectedFile: next.selectedScope?.file ?? null,
    selectedProcedure: next.selectedScope?.procedureId ?? null,
    analysis,
    executions: [...active, ...completed],
    connection: next.connectionState.status,
    error,
  };
}

function requestId(key: RevisionKey): string {
  return `${key.file}\0${key.procedureId}\0${key.revision}`;
}

function revisionIsSelected(
  selected: RevisionKey | null,
  scope: { file: string; procedureId: string },
  revisions: readonly RevisionSummary[],
): boolean {
  if (selected === null) return false;
  if (
    selected.file !== scope.file ||
    selected.procedureId !== scope.procedureId
  )
    return false;
  return revisions.some((revision) => revision.revision === selected.revision);
}

function executionStatus(
  status: ExecutionUpdate["status"],
): ExecutionRecord["status"] {
  if (status === "Running") return "running";
  if (status === "Succeeded") return "succeeded";
  if (status === "Cancelled") return "cancelled";
  return "failed";
}

function recordFromUpdate(
  update: ExecutionUpdate,
  previous?: ExecutionRecord,
): ExecutionRecord {
  const record: ExecutionRecord = {
    executionId: update.executionId,
    displayNumber: update.displayNumber,
    scope: update.scope,
    startedAt: previous?.startedAt,
    status: executionStatus(update.status),
    currentNodeId: update.currentNodeId,
    error: update.error ?? null,
    file: update.scope.file,
    procedure: update.scope.procedureId,
    revision: update.scope.revision,
  };
  if (update.failedNodeId !== undefined)
    record.failedNodeId = update.failedNodeId;
  return record;
}

function addNotification(
  state: LiveWorkspaceState,
  message: string,
  level: "info" | "error",
): LiveWorkspaceState["notifications"] {
  return [
    ...state.notifications,
    { id: `${Date.now()}-${state.notifications.length}`, message, level },
  ].slice(-20);
}

function sourceChangeTransition(
  state: LiveWorkspaceState,
  id: number,
  change: FileChangeEvent,
): Transition {
  if (change.change === "added") {
    const files = state.files.includes(change.file)
      ? state.files
      : [...state.files, change.file].sort((a, b) => a.localeCompare(b));
    return transition(state, {
      files,
      connectionState: { status: "connected", cursor: id },
    });
  }
  if (change.change === "deleted") {
    const files = state.files.filter((file) => file !== change.file);
    if (change.file !== state.selectedFile)
      return transition(state, {
        files,
        connectionState: { status: "connected", cursor: id },
      });
    const activeForFile = Object.values(state.activeExecutionsById).some(
      (execution) => execution.scope.file === change.file,
    );
    const nextFile = files[0];
    const effects: WorkspaceEffect[] = [];
    if (!activeForFile && nextFile !== undefined)
      effects.push({ type: "bootstrap-file", file: nextFile });
    return transition(
      state,
      {
        files,
        fileDeleted: activeForFile,
        errorMessage: activeForFile ? "File deleted" : null,
        connectionState: { status: "connected", cursor: id },
      },
      effects,
    );
  }
  if (change.file !== state.selectedFile) return { state, effects: [] };
  const selected = state.selectedScope;
  const activeForScope =
    selected !== null &&
    Object.values(state.activeExecutionsById).some(
      (execution) =>
        execution.status === "running" &&
        execution.scope.file === selected.file &&
        execution.scope.procedureId === selected.procedureId &&
        execution.scope.revision === selected.revision,
    );
  const effects: WorkspaceEffect[] = [];
  if (selected !== null)
    effects.push({
      type: "load-revisions",
      scope: { file: selected.file, procedureId: selected.procedureId },
    });
  return transition(
    state,
    {
      queuedRevision: activeForScope
        ? (change.revision ?? state.queuedRevision)
        : null,
      connectionState: { status: "connected", cursor: id },
    },
    effects,
  );
}

function preferencesLoaded(
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "preferences-loaded" }>,
): Transition {
  return transition(state, {
    selectedScope: event.scope ?? null,
    importsVisible: event.importsVisible,
  });
}

function filesLoaded(
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "files-loaded" }>,
): Transition {
  const selected = state.selectedScope;
  const nextScope =
    selected !== null && event.files.includes(selected.file) ? selected : null;
  const file = nextScope?.file ?? event.files[0];
  const pane =
    event.files.length === 0 ? { status: "empty" as const } : state.pane;
  const effects: WorkspaceEffect[] = [];
  if (file !== undefined)
    effects.push({
      type: "bootstrap-file",
      file,
      procedureId: nextScope?.procedureId,
      revision: nextScope?.revision,
    });
  return transition(
    state,
    {
      files: event.files,
      selectedScope: nextScope,
      pane,
      errorMessage: null,
      fileDeleted: false,
    },
    effects,
  );
}

function analysisLoading(
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "analysis-loading" }>,
): Transition {
  return transition(state, {
    selectedScope: event.key,
    pane: {
      status: "loading",
      requestId: event.requestId,
      previous: state.analysis ?? undefined,
    },
    errorMessage: null,
    fileDeleted: false,
  });
}

function analysisLoaded(
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "analysis-loaded" }>,
): Transition {
  if (
    state.pane.status !== "loading" ||
    state.pane.requestId !== event.requestId
  )
    return { state, effects: [] };
  return transition(state, {
    selectedScope: {
      file: event.value.file,
      procedureId: event.value.procedureId,
      revision: event.value.revision,
    },
    proceduresByFile: {
      ...state.proceduresByFile,
      [event.value.file]: event.value.procedures,
    },
    pane: { status: "ready", value: event.value },
    snapshots: { ...state.snapshots, [snapshotKey(event.value)]: event.value },
    errorMessage: null,
    queuedRevision: null,
    fileDeleted: false,
  });
}

function analysisFailed(
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "analysis-failed" }>,
): Transition {
  if (
    state.pane.status !== "loading" ||
    state.pane.requestId !== event.requestId
  )
    return { state, effects: [] };
  return transition(state, {
    pane: {
      status: "failed",
      previous: state.pane.previous,
      error: event.error,
    },
    errorMessage: event.error,
  });
}

function revisionsLoaded(
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "revisions-loaded" }>,
): Transition {
  const revisionsByScope = {
    ...state.revisionsByScope,
    [scopeKey(event.scope)]: event.revisions,
  };
  const selected = state.selectedScope;
  if (selected !== null && state.pane.status === "loading")
    return transition(state, { revisionsByScope });
  if (
    selected !== null &&
    !revisionIsSelected(selected, event.scope, event.revisions)
  ) {
    if (
      selected.file !== event.scope.file ||
      selected.procedureId !== event.scope.procedureId
    )
      return transition(state, { revisionsByScope });
    const first = event.revisions[0];
    if (first === undefined) return transition(state, { revisionsByScope });
    const key = { ...event.scope, revision: first.revision };
    return transition(state, { revisionsByScope, selectedScope: key }, [
      { type: "load-analysis", key, requestId: requestId(key) },
    ]);
  }
  if (selected !== null || event.revisions[0] === undefined)
    return transition(state, { revisionsByScope });
  const first = event.revisions[0];
  const key = { ...event.scope, revision: first.revision };
  return transition(state, { revisionsByScope }, [
    { type: "load-analysis", key, requestId: requestId(key) },
  ]);
}

function activeExecutions(
  state: LiveWorkspaceState,
  id: number,
  executions: Extract<
    WorkspaceEvent,
    { type: "active-executions" }
  >["executions"],
): Transition {
  // Hydration can race a just-accepted start request. Keep locally observed
  // runs until the shared stream supplies their authoritative update instead
  // of allowing a late list response to make them disappear.
  const hydrated = Object.fromEntries(
    executions.map((execution) => [
      execution.executionId,
      executionRecordFromActive(execution),
    ]),
  );
  const activeExecutionsById = {
    ...state.activeExecutionsById,
    ...hydrated,
  };
  return transition(state, {
    activeExecutionsById,
    connectionState: { status: "connected", cursor: id },
  });
}

function executionUpdate(
  state: LiveWorkspaceState,
  id: number,
  update: ExecutionUpdate,
): Transition {
  const previous = state.activeExecutionsById[update.executionId];
  const record = recordFromUpdate(update, previous);
  if (update.status === "Running")
    return transition(state, {
      activeExecutionsById: {
        ...state.activeExecutionsById,
        [record.executionId]: record,
      },
      connectionState: { status: "connected", cursor: id },
    });
  const activeExecutionsById = { ...state.activeExecutionsById };
  delete activeExecutionsById[record.executionId];
  const pendingById = { ...state.cancellation.pendingById };
  delete pendingById[record.executionId];
  const statusLabel =
    record.status.charAt(0).toUpperCase() + record.status.slice(1);
  return transition(state, {
    activeExecutionsById,
    completedExecutions: [
      ...state.completedExecutions.filter(
        (item) => item.executionId !== record.executionId,
      ),
      record,
    ],
    cancellation: { ...state.cancellation, pendingById },
    notifications: addNotification(
      state,
      `Execution ${record.executionId.slice(0, 8)} ${statusLabel}.`,
      record.status === "failed" ? "error" : "info",
    ),
    connectionState: { status: "connected", cursor: id },
  });
}

function workspaceEvent(
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "workspace-event" }>,
): Transition {
  const workspace = event.event;
  if (workspace.type === "source-change")
    return sourceChangeTransition(state, event.id, workspace.change);
  if (workspace.type === "active-executions")
    return activeExecutions(state, event.id, workspace.executions);
  if (workspace.type === "execution-update")
    return executionUpdate(state, event.id, workspace.update);
  if (workspace.type === "revision-ready") {
    const selected = state.selectedScope;
    const affectsSelected =
      selected?.file === workspace.revision.file &&
      selected.procedureId === workspace.revision.procedureId;
    const effects: WorkspaceEffect[] = [];
    if (affectsSelected)
      effects.push({
        type: "load-revisions",
        scope: {
          file: workspace.revision.file,
          procedureId: workspace.revision.procedureId,
        },
      });
    return transition(
      state,
      { connectionState: { status: "connected", cursor: event.id } },
      effects,
    );
  }
  if (workspace.type === "resync-required")
    return transition(
      state,
      { connectionState: { status: "reconnecting", cursor: event.id } },
      [{ type: "load-files" }, { type: "load-active-executions" }],
    );
  return transition(state, {
    connectionState: { status: "connected", cursor: event.id },
  });
}

function cancelFailed(
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "cancel-failed" }>,
): Transition {
  const pendingById = { ...state.cancellation.pendingById };
  delete pendingById[event.executionId];
  return transition(state, {
    cancellation: { ...state.cancellation, pendingById },
    errorMessage: event.error,
    notifications: addNotification(state, event.error, "error"),
  });
}

function viewAnalysis(
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "view-analysis" }>,
): Transition {
  return transition(state, {
    selectedScope: event.key,
    pane: { status: "ready", value: event.value },
    proceduresByFile: {
      ...state.proceduresByFile,
      [event.value.file]: event.value.procedures,
    },
    snapshots: { ...state.snapshots, [snapshotKey(event.value)]: event.value },
    errorMessage: null,
  });
}

function selectScope(
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "select-scope" }>,
): Transition {
  const id = event.requestId ?? requestId(event.key);
  return transition(
    state,
    {
      selectedScope: event.key,
      pane: {
        status: "loading",
        requestId: id,
        previous: state.analysis ?? undefined,
      },
      errorMessage: null,
    },
    [{ type: "load-analysis", key: event.key, requestId: id }],
  );
}

export function deriveWorkspaceState(
  state: LiveWorkspaceState,
): LiveWorkspaceState {
  return project(state, {});
}

export function reduceWorkspace(
  state: LiveWorkspaceState = initialLiveWorkspaceState,
  event: LiveWorkspaceEvent,
): Transition {
  switch (event.type) {
    case "preferences-loaded":
      return preferencesLoaded(state, event);
    case "files-loaded":
      return filesLoaded(state, event);
    case "procedures-loaded":
      return transition(state, {
        proceduresByFile: {
          ...state.proceduresByFile,
          [event.file]: event.procedures,
        },
      });
    case "analysis-loading":
      return analysisLoading(state, event);
    case "analysis-loaded":
      return analysisLoaded(state, event);
    case "analysis-failed":
      return analysisFailed(state, event);
    case "revisions-loaded":
      return revisionsLoaded(state, event);
    case "workspace-event":
      return workspaceEvent(state, event);
    case "arm-cancel":
      return transition(state, {
        cancellation: {
          ...state.cancellation,
          armedExecutionId: event.executionId,
        },
      });
    case "confirm-cancel":
      if (state.activeExecutionsById[event.executionId] === undefined)
        return { state, effects: [] };
      return transition(
        state,
        {
          cancellation: {
            armedExecutionId: null,
            pendingById: {
              ...state.cancellation.pendingById,
              [event.executionId]: true,
            },
          },
        },
        [{ type: "cancel-execution", executionId: event.executionId }],
      );
    case "cancel-failed":
      return cancelFailed(state, event);
    case "select-scope":
      return selectScope(state, event);
    case "set-tab":
      return transition(state, { contextTab: event.tab });
    case "focus":
      return transition(state, { focus: event.target });
    case "set-imports-visible":
      return transition(state, { importsVisible: event.visible });
    case "view-analysis":
      return viewAnalysis(state, event);
    case "clear-completed":
      return transition(state, {
        completedExecutions: [],
        selectedExecutionId: state.activeExecutionsById[
          state.selectedExecutionId ?? ""
        ]
          ? state.selectedExecutionId
          : null,
      });
    default:
      return { state, effects: [] };
  }
}
