import type { RevisionKey, WorkspaceEvent } from "@runtime-visualizer/contracts";
import {
  initialLiveWorkspaceState,
  snapshotKey,
  type ExecutionRecord,
  type LiveWorkspaceState,
} from "./liveWorkspace.types";
import type {
  LegacyExecutionStream,
  LiveWorkspacePorts,
  WorkspaceController,
} from "./liveWorkspace.ports";
import { publish } from "./liveWorkspace.state";
import {
  deriveWorkspaceState,
  reduceWorkspace,
  type LiveWorkspaceEvent,
  type Transition,
} from "./liveWorkspace.reducer";
import type { RetryScheduler } from "../../../shared/retry/retryScheduler";

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 250;
const MAX_RECONNECT_DELAY_MS = 4_000;

type WorkspaceStream = AsyncIterable<{
  id: number;
  event: WorkspaceEvent;
}>;

type LegacyExecutionEvent = {
  event: "node" | "result";
  data: { nodeId?: string; status?: "Succeeded" | "Failed"; error?: string };
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Backend unavailable";
}

function requestedProcedureId(
  state: LiveWorkspaceState,
  procedureId: string | undefined,
): string | undefined {
  if (
    procedureId !== undefined &&
    state.analysis?.procedure.kind === "TopLevel" &&
    procedureId === state.analysis.procedure.id
  )
    return undefined;
  return procedureId;
}

function defaultRetryScheduler(): RetryScheduler {
  return {
    schedule(delayMs, task) {
      const handle = globalThis.setTimeout(task, delayMs);
      return () => globalThis.clearTimeout(handle);
    },
  };
}

function executionUpdate(
  record: ExecutionRecord,
  status: "Running" | "Succeeded" | "Failed" | "Cancelled",
  currentNodeId: string | null,
  error?: string,
): Extract<WorkspaceEvent, { type: "execution-update" }>['update'] {
  return {
    executionId: record.executionId,
    displayNumber: record.displayNumber ?? 1,
    scope: record.scope,
    status,
    currentNodeId,
    ...(error === undefined ? {} : { error }),
  };
}

function activeForScope(
  state: LiveWorkspaceState,
  scope: RevisionKey,
): boolean {
  return Object.values(state.activeExecutionsById).some(
    (execution) =>
      execution.status === "running" &&
      execution.scope.file === scope.file &&
      execution.scope.procedureId === scope.procedureId &&
      execution.scope.revision === scope.revision,
  );
}

export function createLiveWorkspaceController(
  ports: LiveWorkspacePorts,
): WorkspaceController {
  let state: LiveWorkspaceState = initialLiveWorkspaceState;
  let requestSequence = 0;
  let eventSequence = 0;
  let analysisController: AbortController | undefined;
  let eventsController: AbortController | undefined;
  let reconnectCancel: (() => void) | undefined;
  let disposed = false;
  let started = false;
  let reconnectAttempt = 0;
  const retry = ports.retry ?? defaultRetryScheduler();
  const legacyStreams = new Map<string, () => void>();
  const listeners = new Set<(state: LiveWorkspaceState) => void>();

  const set = (next: LiveWorkspaceState): void => {
    if (disposed) return;
    state = deriveWorkspaceState(next);
    publish(listeners, state);
  };

  const savePreferences = (): void => {
    if (state.selectedScope === null || ports.preferences === undefined) return;
    ports.preferences.save({
      ...state.selectedScope,
      importsVisible: state.importsVisible,
    });
  };

  const apply = (transition: Transition): void => {
    set(transition.state);
    for (const effect of transition.effects) void runEffect(effect);
  };

  const dispatch = (event: LiveWorkspaceEvent): void => {
    const before = state;
    apply(reduceWorkspace(state, event));
    if (event.type === "analysis-loaded") savePreferences();
    if (
      event.type === "workspace-event" &&
      event.event.type === "execution-update" &&
      event.event.update.status !== "Running"
    )
      void refreshQueued();
    if (event.type === "legacy-interrupted") void refreshQueued();
    if (before !== state && event.type === "workspace-event") eventSequence = Math.max(eventSequence, event.id);
  };

  const loadExact = async (
    key: RevisionKey,
    requestId = `${++requestSequence}`,
  ): Promise<void> => {
    if (
      state.pane.status !== "loading" ||
      state.pane.requestId !== requestId
    )
      dispatch({ type: "analysis-loading", key, requestId });
    const signal = analysisController?.signal;
    try {
      const analysis = await ports.analysis.load(key, signal);
      if (disposed) return;
      dispatch({ type: "analysis-loaded", key, requestId, value: analysis });
    } catch (error) {
      if (disposed || signal?.aborted) return;
      dispatch({ type: "analysis-failed", requestId, error: errorMessage(error) });
    }
  };

  const bootstrapFile = async (
    file: string,
    procedureId?: string,
    preferredRevision?: string,
  ): Promise<void> => {
    analysisController?.abort();
    const controller = new AbortController();
    analysisController = controller;
    try {
      const current = await ports.analysis.analyse(
        file,
        requestedProcedureId(state, procedureId),
        controller.signal,
      );
      if (disposed || controller.signal.aborted) return;
      dispatch({
        type: "procedures-loaded",
        file: current.file,
        procedures: current.procedures,
      });
      const scope = { file: current.file, procedureId: current.procedureId };
      let revisions = [] as Awaited<ReturnType<typeof ports.analysis.listRevisions>>;
      try {
        revisions = await ports.analysis.listRevisions(scope, controller.signal);
      } catch {
        if (controller.signal.aborted) return;
        // A test double or a backend without persisted history can still show
        // the current diagnostic/analysis response.
        revisions = [];
      }
      if (disposed || controller.signal.aborted) return;
      const requested = preferredRevision !== undefined &&
        revisions.some((revision) => revision.revision === preferredRevision)
        ? preferredRevision
        : revisions[0]?.revision ?? current.revision;
      const key: RevisionKey = { ...scope, revision: requested };
      const id = `${++requestSequence}`;
      dispatch({ type: "analysis-loading", key, requestId: id });
      dispatch({ type: "revisions-loaded", scope, revisions });
      if (requested === current.revision) {
        dispatch({ type: "analysis-loaded", key, requestId: id, value: current });
      } else {
        await loadExact(key, id);
      }
    } catch (error) {
      if (disposed || controller.signal.aborted) return;
      const id = `${++requestSequence}`;
      const key: RevisionKey = {
        file,
        procedureId: procedureId ?? "top-level",
        revision: preferredRevision ?? "unavailable",
      };
      dispatch({ type: "analysis-loading", key, requestId: id });
      dispatch({ type: "analysis-failed", requestId: id, error: errorMessage(error) });
    }
  };

  const loadFiles = async (): Promise<void> => {
    try {
      const files = await ports.analysis.listFiles();
      if (!disposed) dispatch({ type: "files-loaded", files });
    } catch (error) {
      if (!disposed)
        set({ ...state, errorMessage: errorMessage(error) });
    }
  };

  const loadActiveExecutions = async (): Promise<void> => {
    if (ports.execution.list === undefined) return;
    try {
      const executions = await ports.execution.list();
      if (disposed) return;
      const id = Math.max(eventSequence + 1, 1);
      dispatch({ type: "workspace-event", id, event: { type: "active-executions", executions: [...executions] } });
    } catch (error) {
      if (!disposed) set({ ...state, errorMessage: errorMessage(error) });
    }
  };

  const scheduleReconnect = (): void => {
    if (disposed || reconnectCancel !== undefined) return;
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) return;
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    reconnectAttempt += 1;
    reconnectCancel = retry.schedule(delay, () => {
      reconnectCancel = undefined;
      void observeEvents();
    });
  };

  const observeLegacyFileEvents = async (): Promise<void> => {
    if (ports.fileEvents === undefined) return;
    const events = new AbortController();
    eventsController = events;
    try {
      set({
        ...state,
        connectionState: { ...state.connectionState, status: "connected" },
        errorMessage: null,
      });
      for await (const change of ports.fileEvents.subscribe(events.signal)) {
        if (disposed) return;
        dispatch({
          type: "workspace-event",
          id: ++eventSequence,
          event: { type: "source-change", change },
        });
      }
      if (!disposed && !events.signal.aborted) throw new Error("File event stream ended");
    } catch (error) {
      if (!disposed && !events.signal.aborted) {
        set({
          ...state,
          connectionState: { status: "reconnecting", cursor: state.connectionState.cursor },
          errorMessage: errorMessage(error),
        });
        scheduleReconnect();
      }
    } finally {
      if (eventsController === events) eventsController = undefined;
    }
  };

  const observeEvents = async (): Promise<void> => {
    if (ports.workspaceEvents === undefined) {
      await observeLegacyFileEvents();
      return;
    }
    eventsController?.abort();
    const events = new AbortController();
    eventsController = events;
    try {
      set({
        ...state,
        connectionState: { ...state.connectionState, status: "connected" },
        errorMessage: null,
      });
      reconnectAttempt = 0;
      const stream = ports.workspaceEvents.subscribe(
        events.signal,
        state.connectionState.cursor,
      ) as WorkspaceStream;
      for await (const record of stream) {
        if (disposed) return;
        dispatch({ type: "workspace-event", id: record.id, event: record.event });
      }
      if (!disposed && !events.signal.aborted)
        throw new Error("Workspace event stream ended");
    } catch (error) {
      if (disposed || events.signal.aborted) return;
      set({
        ...state,
        connectionState: {
          status: "reconnecting",
          cursor: state.connectionState.cursor,
        },
        errorMessage: errorMessage(error),
      });
      scheduleReconnect();
    } finally {
      if (eventsController === events) eventsController = undefined;
    }
  };

  const observeLegacyExecution = async (
    record: ExecutionRecord,
    stream: LegacyExecutionStream,
  ): Promise<void> => {
    let terminal = false;
    try {
      for await (const raw of stream.events) {
        if (disposed) return;
        const event = raw as LegacyExecutionEvent;
        const current = state.activeExecutionsById[record.executionId] ?? record;
        if (event.event === "node" && event.data.nodeId !== undefined) {
          dispatch({
            type: "workspace-event",
            id: ++eventSequence,
            event: {
              type: "execution-update",
              update: executionUpdate(current, "Running", event.data.nodeId),
            },
          });
        } else if (event.event === "result" && event.data.status !== undefined) {
          terminal = true;
          dispatch({
            type: "workspace-event",
            id: ++eventSequence,
            event: {
              type: "execution-update",
              update: executionUpdate(
                current,
                event.data.status,
                null,
                event.data.error,
              ),
            },
          });
        }
      }
      if (!terminal && !disposed)
        dispatch({
          type: "legacy-interrupted",
          executionId: record.executionId,
          error: "Execution stream ended before a result.",
        });
    } catch (error) {
      if (!disposed)
        dispatch({
          type: "legacy-interrupted",
          executionId: record.executionId,
          error: errorMessage(error),
        });
    } finally {
      legacyStreams.delete(record.executionId);
    }
  };

  const runProcedure = async (): Promise<void> => {
    const analysis = state.analysis;
    const scope = state.selectedScope;
    if (
      analysis === null ||
      analysis.cfg === null ||
      state.pane.status !== "ready" ||
      scope === null ||
      state.connection === "reconnecting" ||
      state.fileDeleted
    )
      return;
    try {
      const started = await ports.execution.start(scope);
      if (disposed) {
        if (typeof started !== "string") started.cancel();
        return;
      }
      const executionId = typeof started === "string" ? started : started.executionId;
      const record: ExecutionRecord = {
        executionId,
        scope,
        status: "running",
        currentNodeId: null,
        error: null,
        file: scope.file,
        procedure: scope.procedureId,
        revision: scope.revision,
      };
      dispatch({
        type: "workspace-event",
        id: ++eventSequence,
        event: {
          type: "execution-update",
          update: executionUpdate(record, "Running", null),
        },
      });
      if (typeof started !== "string") {
        legacyStreams.set(executionId, started.cancel);
        void observeLegacyExecution(record, started);
      }
    } catch (error) {
      if (!disposed) set({ ...state, errorMessage: errorMessage(error) });
    }
  };

  const refreshQueued = async (): Promise<void> => {
    const selected = state.selectedScope;
    if (selected !== null && activeForScope(state, selected)) return;
    if (state.fileDeleted) {
      const nextFile = state.files[0];
      if (nextFile === undefined) {
        set({
          ...state,
          selectedScope: null,
          pane: { status: "empty" },
          fileDeleted: false,
        });
      } else {
        await bootstrapFile(nextFile);
      }
      return;
    }
    if (state.queuedRevision !== null && selected !== null)
      await bootstrapFile(selected.file, selected.procedureId);
  };

  const runEffect = async (
    effect: import("./liveWorkspace.effects").WorkspaceEffect,
  ): Promise<void> => {
    if (disposed) return;
    if (effect.type === "bootstrap-file") {
      await bootstrapFile(effect.file, effect.procedureId, effect.revision);
      return;
    }
    if (effect.type === "load-analysis") {
      await loadExact(effect.key, effect.requestId);
      return;
    }
    if (effect.type === "load-files") {
      await loadFiles();
      return;
    }
    if (effect.type === "load-revisions") {
      try {
        const revisions = await ports.analysis.listRevisions(effect.scope);
        if (!disposed) dispatch({ type: "revisions-loaded", scope: effect.scope, revisions });
      } catch (error) {
        if (!disposed) set({ ...state, errorMessage: errorMessage(error) });
      }
      return;
    }
    if (effect.type === "load-active-executions") {
      await loadActiveExecutions();
      return;
    }
    if (effect.type === "cancel-execution") {
      try {
        if (ports.execution.cancel === undefined)
          throw new Error("Execution cancellation is unavailable");
        await ports.execution.cancel(effect.executionId);
      } catch (error) {
        if (!disposed)
          dispatch({
            type: "cancel-failed",
            executionId: effect.executionId,
            error: errorMessage(error),
          });
      }
    }
  };

  return {
    getState: () => state,
    dispatch,
    start: () => {
      if (started) return;
      started = true;
      disposed = false;
      const saved = ports.preferences?.load();
      if (saved)
        dispatch({
          type: "preferences-loaded",
          scope: {
            file: saved.file,
            procedureId: saved.procedureId,
            revision: saved.revision,
          },
          importsVisible: saved.importsVisible,
        });
      void loadFiles();
      void observeEvents();
      void loadActiveExecutions();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    selectFile: (file) => {
      if (state.connection === "reconnecting" || !state.files.includes(file)) return;
      void bootstrapFile(file);
    },
    selectProcedure: (procedureId) => {
      if (state.connection === "reconnecting" || state.selectedFile === null) return;
      void bootstrapFile(state.selectedFile, procedureId);
    },
    selectRevision: (key) => {
      if (key === null || state.connection === "reconnecting") return;
      analysisController?.abort();
      analysisController = new AbortController();
      dispatch({ type: "select-scope", key, requestId: `${++requestSequence}` });
    },
    runProcedure: () => void runProcedure(),
    selectExecution: (executionId) => {
      const execution = state.executions.find((item) => item.executionId === executionId);
      if (execution === undefined) return;
      const analysis = state.snapshots[snapshotKey({
        file: execution.scope.file,
        procedureId: execution.scope.procedureId,
        revision: execution.scope.revision,
      })];
      if (analysis === undefined) {
        analysisController?.abort();
        analysisController = new AbortController();
        dispatch({ type: "select-scope", key: execution.scope, requestId: `${++requestSequence}` });
      } else {
        dispatch({ type: "view-analysis", key: execution.scope, value: analysis });
      }
      set({ ...state, selectedExecutionId: executionId });
    },
    armCancel: (executionId) => dispatch({ type: "arm-cancel", executionId }),
    confirmCancel: (executionId) => dispatch({ type: "confirm-cancel", executionId }),
    clearCompleted: () => dispatch({ type: "clear-completed" }),
    retry: () => {
      reconnectCancel?.();
      reconnectCancel = undefined;
      reconnectAttempt = 0;
      void loadFiles();
      void observeEvents();
      void loadActiveExecutions();
    },
    dispose: () => {
      disposed = true;
      started = false;
      analysisController?.abort();
      eventsController?.abort();
      reconnectCancel?.();
      reconnectCancel = undefined;
      for (const cancel of legacyStreams.values()) cancel();
      legacyStreams.clear();
      listeners.clear();
    },
  };
}
