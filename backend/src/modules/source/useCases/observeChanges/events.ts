import type { FastifyPluginAsync } from "fastify";
import type { SourceChangeWatcher, SourceChange } from "./change-watcher.ts";
import type { WorkspaceEventHub } from "../../../workspace/eventHub.ts";

type EventsRoutesOptions = { readonly watcher: SourceChangeWatcher; readonly hub?: WorkspaceEventHub; readonly onChange?: (change: SourceChange) => void };
const eventsRoutes: FastifyPluginAsync<EventsRoutesOptions> = async (app, options) => {
  app.get("/", async (request, reply) => {
    await options.watcher.refresh();
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    const last = request.headers["last-event-id"];
    const cursor = typeof last === "string" && /^\d+$/.test(last) ? Number(last) : undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": connected\n\n"));
        const workspaceStream = options.hub !== undefined && request.query && (request.query as { workspace?: string }).workspace === "1";
        if (workspaceStream && options.hub) {
          let sourceUnsubscribe: (() => void) | undefined;
          const subscription = options.hub.subscribe(cursor, (record) => {
            if (record.event.type === "source-change") controller.enqueue(encoder.encode(`event: file-change\ndata: ${JSON.stringify(record.event.change)}\n\n`));
            controller.enqueue(encoder.encode(`id: ${record.id}\nevent: ${record.event.type}\ndata: ${JSON.stringify(record.event)}\n\n`));
          });
          if (subscription.resyncRequired) controller.enqueue(encoder.encode("event: resync-required\ndata: {}\n\n"));
          for (const record of subscription.replay) {
            if (record.event.type === "source-change") controller.enqueue(encoder.encode(`event: file-change\ndata: ${JSON.stringify(record.event.change)}\n\n`));
            controller.enqueue(encoder.encode(`id: ${record.id}\nevent: ${record.event.type}\ndata: ${JSON.stringify(record.event)}\n\n`));
          }
          sourceUnsubscribe = options.watcher.subscribe((change) => {
            options.onChange?.(change);
            options.hub?.publish({ type: "source-change", change });
          });
          unsubscribe = () => {
            sourceUnsubscribe?.();
            subscription.unsubscribe();
          };
        } else {
          unsubscribe = options.watcher.subscribe((change: SourceChange) => { options.onChange?.(change); controller.enqueue(encoder.encode(`event: file-change\ndata: ${JSON.stringify(change)}\n\n`)); });
        }
      },
      cancel() { unsubscribe?.(); },
    });
    return reply.header("content-type", "text/event-stream").header("cache-control", "no-cache").header("connection", "keep-alive").send(stream);
  });
};
export default eventsRoutes;
