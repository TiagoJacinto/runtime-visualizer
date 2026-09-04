import type { FastifyPluginAsync } from "fastify";
import type { SourceChange, SourceChangeWatcher } from "./change-watcher.ts";
import type { WorkspaceEventHub } from "../../../workspace/eventHub.ts";

type EventsRoutesOptions = {
  readonly watcher: SourceChangeWatcher;
  readonly hub: WorkspaceEventHub;
  readonly onChange?: (change: SourceChange) => void;
  readonly activeExecutions?: () =>
    | import("../../../../../../packages/contracts/src/index.ts").ActiveExecution[]
    | readonly import("../../../../../../packages/contracts/src/index.ts").ActiveExecution[];
};

const eventsRoutes: FastifyPluginAsync<EventsRoutesOptions> = async (
  app,
  options,
) => {
  app.get("/", async (request, reply) => {
    await options.watcher.refresh();
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    const last = request.headers["last-event-id"];
    const cursor =
      typeof last === "string" && /^\d+$/.test(last) ? Number(last) : undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": connected\n\n"));
        const write = (record: {
          readonly id: number;
          readonly event: import("../../../../../../packages/contracts/src/index.ts").WorkspaceEvent;
        }): void => {
          controller.enqueue(
            encoder.encode(
              `id: ${record.id}\nevent: ${record.event.type}\ndata: ${JSON.stringify(record.event)}\n\n`,
            ),
          );
        };
        const subscription = options.hub.subscribe(cursor, write);
        if (subscription.resyncRequired)
          controller.enqueue(
            encoder.encode(
              'event: resync-required\ndata: {"type":"resync-required"}\n\n',
            ),
          );
        for (const record of subscription.replay) write(record);
        options.hub.publish({
          type: "active-executions",
          executions: [...(options.activeExecutions?.() ?? [])],
        });
        const sourceUnsubscribe = options.watcher.subscribe((change) => {
          options.onChange?.(change);
          options.hub.publish({ type: "source-change", change });
        });
        unsubscribe = () => {
          sourceUnsubscribe();
          subscription.unsubscribe();
        };
      },
      cancel() {
        unsubscribe?.();
      },
    });
    return reply
      .header("content-type", "text/event-stream")
      .header("cache-control", "no-cache")
      .header("connection", "keep-alive")
      .send(stream);
  });
};

export default eventsRoutes;
