/* oxlint-disable avoid-new */
import type { WorkspaceEventRecord, WorkspaceEventsGatewayPort } from "../../shared/api/workspace-events-gateway.ts";

const idle = async function* idle(
  signal: AbortSignal
): AsyncGenerator<WorkspaceEventRecord> {
  await new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
  yield* [];
};

export const createEmptyWorkspaceEvents = (): WorkspaceEventsGatewayPort => ({
  subscribe: (signal, _cursor) => idle(signal),
});
