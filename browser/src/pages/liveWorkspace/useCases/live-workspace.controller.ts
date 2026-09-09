import type {
  RevisionKey,
  WorkspaceEvent,
} from "@runtime-visualizer/contracts";

import { RetryScheduler } from "../../../shared/retry/retry-scheduler";
import type { WorkspaceEffect } from "./live-workspace.effects";
import type {
  LiveWorkspacePorts,
  WorkspaceController,
} from "./live-workspace.ports";
import {
  deriveWorkspaceState,
  reduceWorkspace,
} from "./live-workspace.reducer";
import type { LiveWorkspaceEvent, Transition } from "./live-workspace.reducer";
import { publish } from "./live-workspace.state";
import { initialLiveWorkspaceState, snapshotKey } from "./live-workspace.types";
import type {
  ExecutionRecord,
  LiveWorkspaceState,
} from "./live-workspace.types";

// Effects are declared after the state-machine closures and invoked after construction.
// oxlint-disable eslint/no-use-before-define

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 250;
const MAX_RECONNECT_DELAY_MS = 4000;
type WorkspaceStream = AsyncIterable<{
  id: number;
  event: WorkspaceEvent;
}>;
type Revisions = Awaited<
  ReturnType<LiveWorkspacePorts["analysis"]["listRevisions"]>
>;
// SAFETY: errors are normalized at this internal async boundary.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Backend unavailable";
const requestedProcedureId = (
  state: LiveWorkspaceState,
  procedureId: string | undefined
): string | undefined => {
  if (
    procedureId !== undefined &&
    state.analysis?.procedure.kind === "TopLevel" &&
    procedureId === state.analysis.procedure.id
  ) {
    return undefined;
  }
  return procedureId;
};
const executionUpdate = (
  record: ExecutionRecord,
  status: "Running" | "Succeeded" | "Failed" | "Cancelled",
  currentNodeId: string | null,
  error?: string
): Extract<
  WorkspaceEvent,
  {
    type: "execution-update";
  }
>["update"] => {
  const update = {
    currentNodeId,
    displayNumber: record.displayNumber ?? 1,
    executionId: record.executionId,
    scope: record.scope,
    status,
  };
  return error === undefined ? update : { ...update, error };
};
const activeForScope = (
  state: LiveWorkspaceState,
  scope: RevisionKey
): boolean =>
  Object.values(state.activeExecutionsById).some(
    (execution) =>
      execution.status === "running" &&
      execution.scope.file === scope.file &&
      execution.scope.procedureId === scope.procedureId &&
      execution.scope.revision === scope.revision
  );
export class LiveWorkspaceController implements WorkspaceController {
  getState!: WorkspaceController["getState"];
  dispatch!: WorkspaceController["dispatch"];
  start!: WorkspaceController["start"];
  subscribe!: WorkspaceController["subscribe"];
  selectFile!: WorkspaceController["selectFile"];
  selectProcedure!: WorkspaceController["selectProcedure"];
  selectRevision!: WorkspaceController["selectRevision"];
  setImportsVisible!: WorkspaceController["setImportsVisible"];
  focus!: WorkspaceController["focus"];
  runProcedure!: WorkspaceController["runProcedure"];
  selectExecution!: WorkspaceController["selectExecution"];
  armCancel!: WorkspaceController["armCancel"];
  confirmCancel!: WorkspaceController["confirmCancel"];
  clearCompleted!: WorkspaceController["clearCompleted"];
  retry!: WorkspaceController["retry"];
  dispose!: WorkspaceController["dispose"];
  constructor(ports: LiveWorkspacePorts) {
    let state: LiveWorkspaceState = initialLiveWorkspaceState;
    let requestSequence = 0;
    let eventSequence = 0;
    let analysisController: AbortController | undefined;
    let eventsController: AbortController | undefined;
    let reconnectCancel: (() => void) | undefined;
    let disposed = false;
    let started = false;
    let reconnectAttempt = 0;
    const nextRequestId = (): string => {
      requestSequence += 1;
      return String(requestSequence);
    };
    const nextEventId = (): number => {
      eventSequence += 1;
      return eventSequence;
    };
    const retry = ports.retry ?? new RetryScheduler();
    const listeners = new Set<(state: LiveWorkspaceState) => void>();
    const set = (next: LiveWorkspaceState): void => {
      if (disposed) {
        return;
      }
      state = deriveWorkspaceState(next);
      publish(listeners, state);
    };
    const savePreferences = (): void => {
      if (state.selectedScope === null || ports.preferences === undefined) {
        return;
      }
      ports.preferences.save({
        ...state.selectedScope,
        importsVisible: state.importsVisible,
      });
    };
    const apply = (transition: Transition): void => {
      set(transition.state);
      for (const effect of transition.effects) {
        void runEffect(effect);
      }
    };
    const dispatch = (event: LiveWorkspaceEvent): void => {
      const before = state;
      apply(reduceWorkspace(state, event));
      if (event.type === "analysis-loaded") {
        savePreferences();
      }
      if (
        event.type === "workspace-event" &&
        event.event.type === "execution-update" &&
        event.event.update.status !== "Running"
      ) {
        void refreshQueued();
      }
      if (before !== state && event.type === "workspace-event") {
        eventSequence = Math.max(eventSequence, event.id);
      }
    };
    const loadExact = async (
      key: RevisionKey,
      requestId = nextRequestId()
    ): Promise<void> => {
      if (
        state.pane.status !== "loading" ||
        state.pane.requestId !== requestId
      ) {
        dispatch({ key, requestId, type: "analysis-loading" });
      }
      const signal = analysisController?.signal;
      try {
        const analysis = await ports.analysis.load(key, signal);
        if (disposed) {
          return;
        }
        dispatch({ key, requestId, type: "analysis-loaded", value: analysis });
      } catch (error) {
        if (disposed || signal?.aborted) {
          return;
        }
        dispatch({
          error: errorMessage(error),
          requestId,
          type: "analysis-failed",
        });
      }
    };
    const bootstrapFile = async (
      file: string,
      procedureId?: string,
      preferredRevision?: string
    ): Promise<void> => {
      analysisController?.abort();
      const controller = new AbortController();
      analysisController = controller;
      try {
        const current = await ports.analysis.analyse(
          file,
          requestedProcedureId(state, procedureId),
          controller.signal
        );
        if (disposed || controller.signal.aborted) {
          return;
        }
        dispatch({
          file: current.file,
          procedures: current.procedures,
          type: "procedures-loaded",
        });
        const scope = { file: current.file, procedureId: current.procedureId };
        let revisions: Revisions = [];
        try {
          revisions = await ports.analysis.listRevisions(
            scope,
            controller.signal
          );
        } catch {
          if (controller.signal.aborted) {
            return;
          }
          // A test double or a backend without persisted history can still show
          // the current diagnostic/analysis response.
          revisions = [];
        }
        if (disposed || controller.signal.aborted) {
          return;
        }
        const requested =
          preferredRevision !== undefined &&
          revisions.some((revision) => revision.revision === preferredRevision)
            ? preferredRevision
            : (revisions[0]?.revision ?? current.revision);
        const key: RevisionKey = { ...scope, revision: requested };
        const id = nextRequestId();
        dispatch({ key, requestId: id, type: "analysis-loading" });
        dispatch({ revisions, scope, type: "revisions-loaded" });
        if (requested === current.revision) {
          dispatch({
            key,
            requestId: id,
            type: "analysis-loaded",
            value: current,
          });
        } else {
          await loadExact(key, id);
        }
      } catch (error) {
        if (disposed || controller.signal.aborted) {
          return;
        }
        const id = nextRequestId();
        const key: RevisionKey = {
          file,
          procedureId: procedureId ?? "top-level",
          revision: preferredRevision ?? "unavailable",
        };
        dispatch({ key, requestId: id, type: "analysis-loading" });
        dispatch({
          error: errorMessage(error),
          requestId: id,
          type: "analysis-failed",
        });
      }
    };
    const loadFiles = async (): Promise<void> => {
      try {
        const files = await ports.analysis.listFiles();
        if (!disposed) {
          dispatch({ files, type: "files-loaded" });
        }
      } catch (error) {
        if (!disposed) {
          set({ ...state, errorMessage: errorMessage(error) });
        }
      }
    };
    const loadActiveExecutions = async (): Promise<void> => {
      if (ports.execution.list === undefined) {
        return;
      }
      try {
        const executions = await ports.execution.list();
        if (disposed) {
          return;
        }
        const id = Math.max(eventSequence + 1, 1);
        dispatch({
          event: { executions: [...executions], type: "active-executions" },
          id,
          type: "workspace-event",
        });
      } catch (error) {
        if (!disposed) {
          set({ ...state, errorMessage: errorMessage(error) });
        }
      }
    };
    const scheduleReconnect = (): void => {
      if (disposed || reconnectCancel !== undefined) {
        return;
      }
      if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
        return;
      }
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempt,
        MAX_RECONNECT_DELAY_MS
      );
      reconnectAttempt += 1;
      reconnectCancel = retry.schedule(delay, () => {
        reconnectCancel = undefined;
        void observeEvents();
      });
    };
    const observeEvents = async (): Promise<void> => {
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
        // SAFETY: the gateway port guarantees the workspace event record shape.
        const stream = ports.workspaceEvents.subscribe(
          events.signal,
          state.connectionState.cursor
        ) as WorkspaceStream;
        for await (const record of stream) {
          if (disposed) {
            return;
          }
          dispatch({
            event: record.event,
            id: record.id,
            type: "workspace-event",
          });
        }
        if (!disposed && !events.signal.aborted) {
          throw new Error("Workspace event stream ended");
        }
      } catch (error) {
        if (disposed || events.signal.aborted) {
          return;
        }
        set({
          ...state,
          connectionState: {
            cursor: state.connectionState.cursor,
            status: "reconnecting",
          },
          errorMessage: errorMessage(error),
        });
        scheduleReconnect();
      } finally {
        if (eventsController === events) {
          eventsController = undefined;
        }
      }
    };
    const runProcedure = async (): Promise<void> => {
      const { analysis } = state;
      const scope = state.selectedScope;
      if (
        analysis === null ||
        analysis.cfg === null ||
        state.pane.status !== "ready" ||
        scope === null ||
        state.connection === "reconnecting" ||
        state.fileDeleted
      ) {
        return;
      }
      try {
        const executionId = await ports.execution.start(scope);
        if (disposed) {
          return;
        }
        const record: ExecutionRecord = {
          currentNodeId: null,
          error: null,
          executionId,
          file: scope.file,
          procedure: scope.procedureId,
          revision: scope.revision,
          scope,
          status: "running",
        };
        dispatch({
          event: {
            type: "execution-update",
            update: executionUpdate(record, "Running", null),
          },
          id: nextEventId(),
          type: "workspace-event",
        });
      } catch (error) {
        if (!disposed) {
          set({ ...state, errorMessage: errorMessage(error) });
        }
      }
    };
    const refreshQueued = async (): Promise<void> => {
      const selected = state.selectedScope;
      if (selected !== null && activeForScope(state, selected)) {
        return;
      }
      if (state.fileDeleted) {
        const [nextFile] = state.files;
        if (nextFile === undefined) {
          set({
            ...state,
            fileDeleted: false,
            pane: { status: "empty" },
            selectedScope: null,
          });
        } else {
          await bootstrapFile(nextFile);
        }
        return;
      }
      if (state.queuedRevision !== null && selected !== null) {
        await bootstrapFile(selected.file, selected.procedureId);
      }
    };
    const runEffect = async (effect: WorkspaceEffect): Promise<void> => {
      if (disposed) {
        return;
      }
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
          if (!disposed) {
            dispatch({
              revisions,
              scope: effect.scope,
              type: "revisions-loaded",
            });
          }
        } catch (error) {
          if (!disposed) {
            set({ ...state, errorMessage: errorMessage(error) });
          }
        }
        return;
      }
      if (effect.type === "load-active-executions") {
        await loadActiveExecutions();
        return;
      }
      if (effect.type === "cancel-execution") {
        try {
          if (ports.execution.cancel === undefined) {
            throw new Error("Execution cancellation is unavailable");
          }
          await ports.execution.cancel(effect.executionId);
        } catch (error) {
          if (!disposed) {
            dispatch({
              error: errorMessage(error),
              executionId: effect.executionId,
              type: "cancel-failed",
            });
          }
        }
      }
    };
    Object.assign(this, {
      armCancel: (executionId) => dispatch({ executionId, type: "arm-cancel" }),
      clearCompleted: () => dispatch({ type: "clear-completed" }),
      confirmCancel: (executionId) =>
        dispatch({ executionId, type: "confirm-cancel" }),
      dispatch,
      dispose: () => {
        disposed = true;
        started = false;
        analysisController?.abort();
        eventsController?.abort();
        reconnectCancel?.();
        reconnectCancel = undefined;
        listeners.clear();
      },
      focus: (target) => dispatch({ target, type: "focus" }),
      getState: () => state,
      retry: () => {
        reconnectCancel?.();
        reconnectCancel = undefined;
        reconnectAttempt = 0;
        void loadFiles();
        void observeEvents();
        void loadActiveExecutions();
      },
      runProcedure: () => {
        runProcedure();
      },
      selectExecution: (executionId) => {
        const execution = state.executions.find(
          (item) => item.executionId === executionId
        );
        if (execution === undefined) {
          return;
        }
        const analysis =
          state.snapshots[
            snapshotKey({
              file: execution.scope.file,
              procedureId: execution.scope.procedureId,
              revision: execution.scope.revision,
            })
          ];
        if (analysis === undefined) {
          analysisController?.abort();
          analysisController = new AbortController();
          dispatch({
            key: execution.scope,
            requestId: nextRequestId(),
            type: "select-scope",
          });
        } else {
          dispatch({
            key: execution.scope,
            type: "view-analysis",
            value: analysis,
          });
        }
        set({ ...state, selectedExecutionId: executionId });
        if (execution.failedNodeId !== undefined) {
          dispatch({
            target: {
              nodeId: execution.failedNodeId,
              origin: "failure",
              scope: execution.scope,
            },
            type: "focus",
          });
        }
      },
      selectFile: (file) => {
        if (
          state.connection === "reconnecting" ||
          !state.files.includes(file)
        ) {
          return;
        }
        void bootstrapFile(file);
      },
      selectProcedure: (procedureId) => {
        if (
          state.connection === "reconnecting" ||
          state.selectedFile === null
        ) {
          return;
        }
        void bootstrapFile(state.selectedFile, procedureId);
      },
      selectRevision: (key) => {
        if (key === null || state.connection === "reconnecting") {
          return;
        }
        analysisController?.abort();
        analysisController = new AbortController();
        dispatch({
          key,
          requestId: nextRequestId(),
          type: "select-scope",
        });
      },
      setImportsVisible: (visible) => {
        dispatch({ type: "set-imports-visible", visible });
        savePreferences();
      },
      start: () => {
        if (started) {
          return;
        }
        started = true;
        disposed = false;
        const saved = ports.preferences?.load();
        if (saved) {
          dispatch({
            importsVisible: saved.importsVisible,
            scope: {
              file: saved.file,
              procedureId: saved.procedureId,
              revision: saved.revision,
            },
            type: "preferences-loaded",
          });
        }
        void loadFiles();
        void observeEvents();
        void loadActiveExecutions();
      },
      subscribe: (listener) => {
        listeners.add(listener);
        listener(state);
        return () => listeners.delete(listener);
      },
    });
  }
}
