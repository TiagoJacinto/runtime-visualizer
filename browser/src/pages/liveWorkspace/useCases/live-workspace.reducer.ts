import type {
  RevisionKey,
  WorkspaceEvent,
} from "@runtime-visualizer/contracts";

import type {
  ExecutionRecord,
  LiveWorkspaceState,
} from "./live-workspace.types";

export interface WorkspaceEffect {
  type: "cancel-execution";
  executionId: string;
}

export type LiveWorkspaceEvent =
  | {
      type: "preferences-loaded";
      scope?: RevisionKey;
      importsVisible: boolean;
    }
  | {
      type: "select-scope";
      key: RevisionKey | null;
    }
  | {
      type: "select-execution";
      executionId: string;
    }
  | {
      type: "set-tab";
      tab: "scope" | "runs";
    }
  | {
      type: "focus";
      target: LiveWorkspaceState["focus"];
    }
  | {
      type: "set-imports-visible";
      visible: boolean;
    }
  | {
      type: "arm-cancel";
      executionId: string;
    }
  | {
      type: "confirm-cancel";
      executionId: string;
      active: boolean;
    }
  | {
      type: "cancel-failed";
      executionId: string;
      error: string;
    }
  | {
      type: "execution-finished";
      execution: ExecutionRecord;
    }
  | {
      type: "workspace-event";
      id: number;
      event: WorkspaceEvent;
      activeForFile?: boolean;
      activeForScope?: boolean;
    }
  | {
      type: "resource-error";
      error: string;
    }
  | {
      type: "clear-resource-error";
    }
  | {
      type: "clear-selection";
    }
  | {
      type: "clear-completed";
    };

export interface Transition {
  state: LiveWorkspaceState;
  effects: readonly WorkspaceEffect[];
}

const transition = (
  state: LiveWorkspaceState,
  patch: Partial<LiveWorkspaceState>,
  effects: readonly WorkspaceEffect[] = []
): Transition => ({
  effects,
  state: { ...state, ...patch },
});

const addNotification = (
  state: LiveWorkspaceState,
  message: string,
  level: "info" | "error"
): LiveWorkspaceState["notifications"] =>
  [
    ...state.notifications,
    { id: `${Date.now()}-${state.notifications.length}`, level, message },
  ].slice(-20);

const workspaceEvent = (
  state: LiveWorkspaceState,
  event: Extract<LiveWorkspaceEvent, { type: "workspace-event" }>
): Transition => {
  const workspace = event.event;
  const connectionState = {
    cursor: event.id,
    status: "connected" as const,
  };
  if (workspace.type === "source-change") {
    if (
      workspace.change.change === "deleted" &&
      workspace.change.file === state.selectedScope?.file &&
      event.activeForFile
    ) {
      return transition(state, {
        connectionState,
        errorMessage: "File deleted",
        fileDeleted: true,
      });
    }
    if (
      workspace.change.change === "modified" &&
      workspace.change.file === state.selectedScope?.file &&
      event.activeForScope
    ) {
      return transition(state, {
        connectionState,
        queuedRevision: workspace.change.revision ?? state.queuedRevision,
      });
    }
  }
  if (workspace.type === "resync-required") {
    return transition(state, { connectionState });
  }
  return transition(state, { connectionState });
};

export const reduceWorkspace = (
  state: LiveWorkspaceState,
  event: LiveWorkspaceEvent
): Transition => {
  switch (event.type) {
    case "preferences-loaded": {
      return transition(state, {
        importsVisible: event.importsVisible,
        selectedScope: event.scope ?? null,
      });
    }
    case "select-scope": {
      return transition(state, {
        errorMessage: null,
        fileDeleted: false,
        queuedRevision: null,
        selectedScope: event.key,
      });
    }
    case "select-execution": {
      return transition(state, { selectedExecutionId: event.executionId });
    }
    case "set-tab": {
      return transition(state, { contextTab: event.tab });
    }
    case "focus": {
      return transition(state, { focus: event.target });
    }
    case "set-imports-visible": {
      return transition(state, { importsVisible: event.visible });
    }
    case "arm-cancel": {
      return transition(state, {
        cancellation: {
          ...state.cancellation,
          armedExecutionId: event.executionId,
        },
      });
    }
    case "confirm-cancel": {
      if (!event.active) {
        return { effects: [], state };
      }
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
        [{ executionId: event.executionId, type: "cancel-execution" }]
      );
    }
    case "cancel-failed": {
      const { [event.executionId]: _pending, ...pendingById } =
        state.cancellation.pendingById;
      return transition(state, {
        cancellation: {
          armedExecutionId: null,
          pendingById,
        },
        errorMessage: event.error,
      });
    }
    case "execution-finished": {
      const { [event.execution.executionId]: _pending, ...pendingById } =
        state.cancellation.pendingById;
      const statusLabel =
        event.execution.status.charAt(0).toUpperCase() +
        event.execution.status.slice(1);
      return transition(state, {
        cancellation: {
          armedExecutionId:
            state.cancellation.armedExecutionId === event.execution.executionId
              ? null
              : state.cancellation.armedExecutionId,
          pendingById,
        },
        completedExecutions: [
          ...state.completedExecutions.filter(
            (execution) => execution.executionId !== event.execution.executionId
          ),
          event.execution,
        ],
        notifications: addNotification(
          state,
          `Execution ${event.execution.executionId.slice(0, 8)} ${statusLabel}.`,
          event.execution.status === "failed" ? "error" : "info"
        ),
      });
    }
    case "workspace-event": {
      return workspaceEvent(state, event);
    }
    case "resource-error": {
      return transition(state, { errorMessage: event.error });
    }
    case "clear-resource-error": {
      return transition(state, { errorMessage: null });
    }
    case "clear-selection": {
      return transition(state, {
        fileDeleted: false,
        queuedRevision: null,
        selectedExecutionId: null,
        selectedScope: null,
      });
    }
    case "clear-completed": {
      return transition(state, {
        completedExecutions: [],
        selectedExecutionId: null,
      });
    }
    default: {
      return { effects: [], state };
    }
  }
};
