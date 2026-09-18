import type {
  ExecutionUpdate,
  RevisionKey,
  WorkspaceEvent,
} from "@runtime-visualizer/contracts";

import { RetryScheduler } from "../../../shared/retry/retry-scheduler";
import { createWorkspaceEventStream } from "./live-workspace.event-stream";
import type {
  LiveWorkspacePorts,
  WorkspaceController,
} from "./live-workspace.ports";
import { createLiveWorkspaceQueries } from "./live-workspace.query";
import type { LiveWorkspaceQueries } from "./live-workspace.query";
import type { LiveWorkspaceEvent, Transition } from "./live-workspace.reducer";
import { reduceWorkspace } from "./live-workspace.reducer";
import { publish } from "./live-workspace.state";
import {
  executionRecordFromActive,
  initialLiveWorkspaceState,
} from "./live-workspace.types";
import type {
  ExecutionRecord,
  LiveWorkspaceState,
} from "./live-workspace.types";

// SAFETY: caught values are normalized at this controller async boundary.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Backend unavailable";

const sameScope = (a: RevisionKey, b: RevisionKey): boolean =>
  a.file === b.file &&
  a.procedureId === b.procedureId &&
  a.revision === b.revision;

const activeForScope = (
  queries: LiveWorkspaceQueries,
  scope: RevisionKey
): boolean =>
  queries
    .getActiveExecutions()
    .some((execution) => sameScope(execution.scope, scope));

const executionStatus = (
  status: ExecutionUpdate["status"]
): ExecutionRecord["status"] => {
  if (status === "Succeeded") {
    return "succeeded";
  }
  if (status === "Failed") {
    return "failed";
  }
  if (status === "Cancelled") {
    return "cancelled";
  }
  return "running";
};

const recordFromUpdate = (
  update: ExecutionUpdate,
  previous: ExecutionRecord | undefined
): ExecutionRecord => ({
  currentNodeId: update.currentNodeId,
  displayNumber: update.displayNumber,
  error: update.error ?? null,
  executionId: update.executionId,
  failedNodeId: update.failedNodeId,
  file: update.scope.file,
  procedure: update.scope.procedureId,
  revision: update.scope.revision,
  scope: update.scope,
  startedAt: previous?.startedAt,
  status: executionStatus(update.status),
});

export class LiveWorkspaceController implements WorkspaceController {
  readonly queries: LiveWorkspaceQueries;
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
    this.queries =
      ports.queries ??
      createLiveWorkspaceQueries({
        analysis: ports.analysis,
        execution: ports.execution,
      });
    const { queries } = this;
    let state = initialLiveWorkspaceState;
    let disposed = false;
    let started = false;
    const retry = ports.retry ?? new RetryScheduler();
    const listeners = new Set<(state: LiveWorkspaceState) => void>();

    const publishState = (next: LiveWorkspaceState): void => {
      if (disposed) {
        return;
      }
      state = next;
      publish(listeners, state);
    };
    const applyTransition = (transition: Transition): void => {
      publishState(transition.state);
      for (const effect of transition.effects) {
        // oxlint-disable-next-line eslint/no-use-before-define
        void runEffect(effect);
      }
    };
    const dispatch = (event: LiveWorkspaceEvent): void => {
      applyTransition(reduceWorkspace(state, event));
    };
    const loadExact = async (key: RevisionKey): Promise<void> => {
      try {
        await queries.fetchAnalysis(key);
        if (!disposed) {
          dispatch({ type: "clear-resource-error" });
        }
      } catch (error) {
        if (!disposed) {
          dispatch({ error: errorMessage(error), type: "resource-error" });
        }
      }
    };
    const requestedProcedureId = (
      file: string,
      procedureId: string | undefined
    ): string | undefined =>
      procedureId ??
      (state.selectedScope?.file === file
        ? state.selectedScope.procedureId
        : undefined);
    const bootstrapFile = async (
      file: string,
      procedureId?: string,
      preferredRevision?: string
    ): Promise<void> => {
      try {
        const current = await queries.fetchCurrentAnalysis(
          file,
          requestedProcedureId(file, procedureId)
        );
        if (disposed) {
          return;
        }
        const scope = { file: current.file, procedureId: current.procedureId };
        const revisions = await queries.fetchRevisions(scope);
        if (disposed) {
          return;
        }
        const revision =
          preferredRevision !== undefined &&
          revisions.some((item) => item.revision === preferredRevision)
            ? preferredRevision
            : (revisions[0]?.revision ?? current.revision);
        const key = { ...scope, revision };
        dispatch({ key, type: "select-scope" });
        await loadExact(key);
      } catch (error) {
        if (!disposed) {
          dispatch({ error: errorMessage(error), type: "resource-error" });
        }
      }
    };
    const loadFiles = async (): Promise<readonly string[]> => {
      try {
        return await queries.fetchFiles();
      } catch (error) {
        if (!disposed) {
          dispatch({ error: errorMessage(error), type: "resource-error" });
        }
        return [];
      }
    };
    const loadActiveExecutions = async (): Promise<void> => {
      try {
        await queries.fetchActiveExecutions();
      } catch (error) {
        if (!disposed) {
          dispatch({ error: errorMessage(error), type: "resource-error" });
        }
      }
    };
    const loadInitial = async (): Promise<void> => {
      const files = await loadFiles();
      if (disposed || files.length === 0) {
        return;
      }
      const selected = state.selectedScope;
      if (selected !== null && files.includes(selected.file)) {
        await bootstrapFile(
          selected.file,
          selected.procedureId,
          selected.revision
        );
      } else if (selected === null) {
        await bootstrapFile(files[0]);
      }
    };
    const refreshWorkspaceResources = (): void => {
      void loadInitial();
      void loadActiveExecutions();
    };
    const refreshRevisionHistory = async (
      scope: Pick<RevisionKey, "file" | "procedureId">
    ): Promise<void> => {
      try {
        const revisions = await queries.fetchRevisions(scope);
        const selected = state.selectedScope;
        const [first] = revisions;
        if (
          first !== undefined &&
          selected !== null &&
          selected.file === scope.file &&
          selected.procedureId === scope.procedureId &&
          first.revision !== selected.revision &&
          !activeForScope(queries, selected)
        ) {
          await bootstrapFile(scope.file, scope.procedureId);
        }
      } catch (error) {
        if (!disposed) {
          dispatch({ error: errorMessage(error), type: "resource-error" });
        }
      }
    };
    const refreshQueued = async (): Promise<void> => {
      const selected = state.selectedScope;
      if (selected !== null && activeForScope(queries, selected)) {
        return;
      }
      if (state.fileDeleted) {
        const nextFile = queries.getFiles()?.[0];
        if (nextFile === undefined) {
          dispatch({ type: "clear-selection" });
        } else {
          await bootstrapFile(nextFile);
        }
        return;
      }
      if (state.queuedRevision !== null && selected !== null) {
        await bootstrapFile(selected.file, selected.procedureId);
      }
    };
    const handleDeletedSourceChange = (
      file: string,
      selected: RevisionKey | null,
      activeFile: boolean
    ): void => {
      if (selected?.file !== file || activeFile) {
        return;
      }
      const nextFile = queries.getFiles()?.[0];
      if (nextFile === undefined) {
        dispatch({ type: "clear-selection" });
      } else {
        void bootstrapFile(nextFile);
      }
    };
    const handleWorkspaceEvent = (id: number, event: WorkspaceEvent): void => {
      const selected = state.selectedScope;
      const before = queries.getActiveExecutions();
      const activeFile =
        event.type === "source-change"
          ? before.some(
              (execution) => execution.scope.file === event.change.file
            )
          : undefined;
      const activeScope =
        event.type === "source-change" && selected !== null
          ? before.some((execution) => sameScope(execution.scope, selected))
          : undefined;
      const result = queries.applyWorkspaceEvent(event);
      dispatch({
        activeForFile: activeFile,
        activeForScope: activeScope,
        event,
        id,
        type: "workspace-event",
      });
      if (result.terminal !== undefined) {
        const previous = before.find(
          (execution) => execution.executionId === result.terminal?.executionId
        );
        dispatch({
          execution: recordFromUpdate(
            result.terminal,
            previous === undefined
              ? undefined
              : executionRecordFromActive(previous)
          ),
          type: "execution-finished",
        });
        void refreshQueued();
      }
      if (event.type === "source-change") {
        if (event.change.change === "modified" && selected !== null) {
          if (activeScope) {
            return;
          }
          void refreshRevisionHistory({
            file: selected.file,
            procedureId: selected.procedureId,
          });
        } else if (event.change.change === "deleted") {
          handleDeletedSourceChange(
            event.change.file,
            selected,
            activeFile === true
          );
        } else if (
          event.change.change === "added" &&
          state.selectedScope === null
        ) {
          void bootstrapFile(event.change.file);
        }
      } else if (event.type === "revision-ready") {
        if (
          selected?.file === event.revision.file &&
          selected.procedureId === event.revision.procedureId
        ) {
          void refreshRevisionHistory(event.revision);
        }
      } else if (event.type === "resync-required") {
        refreshWorkspaceResources();
      }
    };
    const eventStream = createWorkspaceEventStream({
      onEvent: (record) => handleWorkspaceEvent(record.id, record.event),
      onState: (next) =>
        publishState({
          ...state,
          connectionState: {
            cursor: next.cursor,
            status: next.status,
          },
          errorMessage: next.errorMessage,
        }),
      retry,
      subscribe: ports.workspaceEvents.subscribe.bind(ports.workspaceEvents),
    });
    const runEffect = async (effect: {
      type: "cancel-execution";
      executionId: string;
    }): Promise<void> => {
      try {
        await queries.cancelExecution(effect.executionId);
      } catch (error) {
        if (!disposed) {
          dispatch({
            error: errorMessage(error),
            executionId: effect.executionId,
            type: "cancel-failed",
          });
        }
      }
    };
    const runProcedure = async (): Promise<void> => {
      const scope = state.selectedScope;
      const analysis = scope === null ? undefined : queries.getAnalysis(scope);
      if (
        scope === null ||
        analysis?.cfg === null ||
        analysis === undefined ||
        analysis.diagnostics.length > 0 ||
        state.connectionState.status === "reconnecting" ||
        state.fileDeleted
      ) {
        return;
      }
      try {
        await queries.startExecution(scope);
      } catch (error) {
        if (!disposed) {
          dispatch({ error: errorMessage(error), type: "resource-error" });
        }
      }
    };

    Object.assign(this, {
      armCancel: (executionId: string) =>
        dispatch({ executionId, type: "arm-cancel" }),
      clearCompleted: () => dispatch({ type: "clear-completed" }),
      confirmCancel: (executionId: string) =>
        dispatch({
          active: queries
            .getActiveExecutions()
            .some((execution) => execution.executionId === executionId),
          executionId,
          type: "confirm-cancel",
        }),
      dispatch,
      dispose: () => {
        disposed = true;
        started = false;
        eventStream.stop();
        listeners.clear();
      },
      focus: (target: LiveWorkspaceState["focus"]) =>
        dispatch({ target, type: "focus" }),
      getState: () => state,
      retry: () => {
        void queries.invalidateMutableResources();
        refreshWorkspaceResources();
        eventStream.retry();
      },
      runProcedure: () => {
        // oxlint-disable-next-line eslint/no-void
        void runProcedure();
      },
      selectExecution: (executionId: string) => {
        const active = queries
          .getActiveExecutions()
          .find((execution) => execution.executionId === executionId);
        const completed = state.completedExecutions.find(
          (execution) => execution.executionId === executionId
        );
        const execution =
          active === undefined ? completed : executionRecordFromActive(active);
        if (execution === undefined) {
          return;
        }
        dispatch({ executionId, type: "select-execution" });
        dispatch({ key: execution.scope, type: "select-scope" });
        if (queries.getAnalysis(execution.scope) === undefined) {
          void loadExact(execution.scope);
        }
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
      selectFile: (file: string) => {
        if (
          state.connectionState.status === "reconnecting" ||
          !queries.getFiles()?.includes(file)
        ) {
          return;
        }
        void bootstrapFile(file);
      },
      selectProcedure: (procedureId: string) => {
        if (
          state.connectionState.status === "reconnecting" ||
          state.selectedScope === null
        ) {
          return;
        }
        void bootstrapFile(state.selectedScope.file, procedureId);
      },
      selectRevision: (key: RevisionKey | null) => {
        if (key === null || state.connectionState.status === "reconnecting") {
          return;
        }
        dispatch({ key, type: "select-scope" });
        void loadExact(key);
      },
      setImportsVisible: (visible: boolean) => {
        dispatch({ type: "set-imports-visible", visible });
        if (state.selectedScope !== null && ports.preferences !== undefined) {
          ports.preferences.save({
            ...state.selectedScope,
            importsVisible: visible,
          });
        }
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
        refreshWorkspaceResources();
        eventStream.start(state.connectionState.cursor);
      },
      subscribe: (listener: (state: LiveWorkspaceState) => void) => {
        listeners.add(listener);
        listener(state);
        return () => listeners.delete(listener);
      },
    });
  }
}
