import type { FastifyPluginCallback } from "fastify";

import type {
  ActiveExecution,
  WorkspaceEvent,
} from "../../../../../../packages/contracts/src/index.ts";
import type { WorkspaceEventHub } from "../../../workspace/index.ts";
import type { SourceChange, SourceChangeWatcher } from "./change-watcher.ts";

interface EventsRoutesOptions {
  readonly watcher: SourceChangeWatcher;
  readonly hub: WorkspaceEventHub;
  readonly onChange?: (change: SourceChange) => void;
  readonly activeExecutions?: () => readonly ActiveExecution[];
}

const eventsRoutes: FastifyPluginCallback<EventsRoutesOptions> = (
  app,
  options,
  done
) => {
  app.get("/", async (request, reply) => {
    await options.watcher.refresh();
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    const last = request.headers["last-event-id"];
    const lastEventId = Array.isArray(last) ? last[0] : last;
    const cursor =
      lastEventId !== undefined && /^\d+$/u.test(lastEventId)
        ? Number(lastEventId)
        : undefined;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        unsubscribe?.();
      },
      start(controller) {
        controller.enqueue(encoder.encode(": connected\n\n"));
        const write = (record: {
          readonly id: number;
          readonly event: WorkspaceEvent;
        }): void => {
          controller.enqueue(
            encoder.encode(
              `id: ${record.id}\nevent: ${record.event.type}\ndata: ${JSON.stringify(record.event)}\n\n`
            )
          );
        };
        const subscription = options.hub.subscribe(cursor, write);
        if (subscription.resyncRequired) {
          controller.enqueue(
            encoder.encode(
              'event: resync-required\ndata: {"type":"resync-required"}\n\n'
            )
          );
        }
        for (const record of subscription.replay) {
          write(record);
        }
        options.hub.publish({
          executions: [...(options.activeExecutions?.() ?? [])],
          type: "active-executions",
        });
        const sourceUnsubscribe = options.watcher.subscribe((change) => {
          options.onChange?.(change);
          options.hub.publish({ change, type: "source-change" });
        });
        unsubscribe = () => {
          sourceUnsubscribe();
          subscription.unsubscribe();
        };
      },
    });
    return reply
      .header("content-type", "text/event-stream")
      .header("cache-control", "no-cache")
      .header("connection", "keep-alive")
      .send(stream);
  });
  done();
};

export default eventsRoutes;
