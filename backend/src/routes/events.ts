import type { FastifyPluginAsync } from "fastify";
import type { SourceChangeWatcher } from "../source/source-change-watcher.ts";

type EventsRoutesOptions = {
	readonly watcher: SourceChangeWatcher;
};

const eventsRoutes: FastifyPluginAsync<EventsRoutesOptions> = async (
	app,
	options,
) => {
	app.get("/", async (_request, reply) => {
		await options.watcher.refresh();
		const encoder = new TextEncoder();
		let unsubscribe: (() => void) | undefined;
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(": connected\n\n"));
				unsubscribe = options.watcher.subscribe((change) => {
					controller.enqueue(
						encoder.encode(
							`event: file-change\ndata: ${JSON.stringify(change)}\n\n`,
						),
					);
				});
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
