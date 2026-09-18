import type {
  WorkspaceEventRecord,
  WorkspaceEventsGatewayPort,
} from "../../../shared/api/workspace-events-gateway";
import type { RetryScheduler } from "../../../shared/retry/retry-scheduler";

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 250;
const MAX_RECONNECT_DELAY_MS = 4000;

export interface WorkspaceEventStreamState {
  cursor: number | null;
  errorMessage: string | null;
  status: "connected" | "reconnecting";
}

export interface WorkspaceEventStream {
  start: (cursor: number | null) => void;
  retry: () => void;
  stop: () => void;
}

export interface WorkspaceEventStreamOptions {
  readonly retry: RetryScheduler;
  readonly subscribe: WorkspaceEventsGatewayPort["subscribe"];
  readonly onEvent: (record: WorkspaceEventRecord) => void;
  readonly onState: (state: WorkspaceEventStreamState) => void;
}

// SAFETY: caught values are normalized at this event-stream boundary.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Backend unavailable";

export const createWorkspaceEventStream = ({
  onEvent,
  onState,
  retry,
  subscribe,
}: WorkspaceEventStreamOptions): WorkspaceEventStream => {
  let controller: AbortController | undefined;
  let cursor: number | null = null;
  let reconnectAttempt = 0;
  let reconnectCancel: (() => void) | undefined;
  let stopped = true;

  // SAFETY: observe is assigned before scheduleReconnect can run.
  // oxlint-disable-next-line eslint/prefer-const
  let observe: () => Promise<void>;

  const scheduleReconnect = (): void => {
    if (stopped || reconnectCancel !== undefined) {
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
      void observe();
    });
  };

  observe = async (): Promise<void> => {
    controller?.abort();
    const nextController = new AbortController();
    controller = nextController;
    onState({ cursor, errorMessage: null, status: "connected" });
    try {
      const stream = subscribe(nextController.signal, cursor);
      for await (const record of stream) {
        if (stopped) {
          return;
        }
        cursor = record.id;
        reconnectAttempt = 0;
        onEvent(record);
      }
      if (!stopped && !nextController.signal.aborted) {
        throw new Error("Workspace event stream ended");
      }
    } catch (error) {
      if (stopped || nextController.signal.aborted) {
        return;
      }
      onState({
        cursor,
        errorMessage: errorMessage(error),
        status: "reconnecting",
      });
      scheduleReconnect();
    } finally {
      if (controller === nextController) {
        controller = undefined;
      }
    }
  };

  return {
    retry: () => {
      if (stopped) {
        return;
      }
      reconnectCancel?.();
      reconnectCancel = undefined;
      reconnectAttempt = 0;
      void observe();
    },
    start: (initialCursor) => {
      stopped = false;
      cursor = initialCursor;
      void observe();
    },
    stop: () => {
      stopped = true;
      controller?.abort();
      controller = undefined;
      reconnectCancel?.();
      reconnectCancel = undefined;
    },
  };
};
