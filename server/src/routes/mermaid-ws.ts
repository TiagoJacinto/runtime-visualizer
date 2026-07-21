/**
 * Mermaid WebSocket endpoint.
 *
 * Path: `ws://<host>/api/mermaid`
 *
 * Protocol (JSON text frames in both directions):
 *
 *   client → server:
 *     { "type": "subscribe",   "entry": "file1.ts" }
 *     { "type": "unsubscribe" }
 *     { "type": "ping" }
 *
 *   server → client:
 *     { "type": "snapshot", "entry": "file1.ts",
 *       "mermaid": "flowchart TD\n...", "files": ["file1.ts", ...] }
 *     { "type": "error", "message": "...", "entry"?: "file1.ts" }
 *     { "type": "pong" }
 *
 * On `subscribe` we walk the local-import subgraph for `entry`, build
 * the per-file CFGs, render Mermaid, and push a `snapshot`. We also
 * install per-file watchers on every file in the subgraph; when any
 * of them changes we rebuild + render + broadcast to every subscriber
 * for that entry.
 *
 * ponytail: rebuild is whole-graph (no diff-based incremental
 * recomputation). With the 3-file demo this is sub-millisecond; if it
 * ever stops being so, the CFG analyser already returns enough
 * metadata for a per-node dirty-bit recompute.
 */

import type http from "node:http";
import * as path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { buildProjectCfg, ProjectCfgError } from "../cfg/project.ts";
import { renderProjectFiles } from "../cfg/mermaid.ts";
import {
	createFsWatchFactory,
	type WatchFactory,
	type WatchHandle,
} from "../cfg/watcher.ts";

type ClientMessage =
	| { readonly type: "subscribe"; readonly entry: string }
	| { readonly type: "unsubscribe" }
	| { readonly type: "ping" };

type ServerMessage =
	| {
			readonly type: "snapshot";
			readonly entry: string;
			readonly mermaid: string;
			readonly files: ReadonlyArray<string>;
	  }
	| {
			readonly type: "error";
			readonly message: string;
			readonly entry?: string;
	  }
	| { readonly type: "pong" };

type Subscription = {
	readonly entry: string;
	readonly clients: Set<WebSocket>;
	/** Result of the in-flight (or completed) arm-watcher call. */
	arming: Promise<WatchHandle | null> | null;
	handle: WatchHandle | null;
	rebuildTimer: ReturnType<typeof setTimeout> | null;
};

export type MermaidWsOptions = {
	/** Project root used when a subscriber doesn't supply one. */
	readonly projectRoot?: string;
	/** Override the file-system watcher (used in tests). */
	readonly watchFactory?: WatchFactory;
};

export type MermaidWsHandle = {
	/** Stops accepting new connections and detaches the upgrade handler. */
	close(): void;
};

const REBUILD_DEBOUNCE_MS = 80;

/**
 * Attaches the Mermaid WebSocket endpoint to an existing HTTP server
 * (e.g. `fastify.server` returned by `fastify.listen()`). The handle
 * is what the caller passes to shutdown-time cleanup.
 */
export function attachMermaidWebSocket(
	server: http.Server,
	options: MermaidWsOptions = {},
): MermaidWsHandle {
	const wss = new WebSocketServer({ noServer: true, path: "/api/mermaid" });
	const watchFactory = options.watchFactory ?? createFsWatchFactory();
	const subscriptions = new Map<string, Subscription>();

	const onUpgrade = (
		req: http.IncomingMessage,
		socket: NodeJS.Socket,
		head: Buffer,
	): void => {
		// Only intercept our path; everything else is left alone so
		// future endpoints (or proxies) can claim it.
		const url = req.url ?? "";
		if (!url.startsWith("/api/mermaid")) return;
		wss.handleUpgrade(
			req,
			socket as unknown as import("stream").Duplex,
			head,
			(ws) => {
				wss.emit("connection", ws, req);
			},
		);
	};
	server.on("upgrade", onUpgrade);

	wss.on("connection", (ws) => {
		let current: Subscription | null = null;

		ws.on("message", (raw) => {
			let msg: ClientMessage;
			try {
				const parsed: unknown = JSON.parse(raw.toString());
				if (!isClientMessage(parsed)) {
					sendError(ws, "Invalid message shape.");
					return;
				}
				msg = parsed;
			} catch {
				sendError(ws, "Message must be valid JSON.");
				return;
			}

			if (msg.type === "ping") {
				send(ws, { type: "pong" });
				return;
			}

			if (msg.type === "unsubscribe") {
				detachClient(current, ws, subscriptions);
				current = null;
				return;
			}

			// subscribe
			void handleSubscribe(
				ws,
				msg.entry,
				options.projectRoot,
				subscriptions,
				watchFactory,
			).then((sub) => {
				current = sub;
			});
		});

		ws.on("close", () => {
			detachClient(current, ws, subscriptions);
			current = null;
		});
		ws.on("error", () => {
			detachClient(current, ws, subscriptions);
			current = null;
		});
	});

	return {
		close(): void {
			server.off("upgrade", onUpgrade);
			for (const sub of subscriptions.values()) {
				if (sub.rebuildTimer !== null) clearTimeout(sub.rebuildTimer);
				if (sub.handle !== null) sub.handle.close();
				for (const client of sub.clients) {
					try {
						client.close();
					} catch {
						// Best-effort: client may already be gone.
					}
				}
			}
			subscriptions.clear();
			wss.close();
		},
	};
}

// ---------------------------------------------------------------------------
// Subscription lifecycle
// ---------------------------------------------------------------------------

async function handleSubscribe(
	ws: WebSocket,
	entry: string,
	projectRoot: string | undefined,
	subscriptions: Map<string, Subscription>,
	watchFactory: WatchFactory,
): Promise<Subscription> {
	let sub = subscriptions.get(entry);
	if (sub === undefined) {
		sub = {
			entry,
			clients: new Set(),
			arming: null,
			handle: null,
			rebuildTimer: null,
		};
		subscriptions.set(entry, sub);
	}
	sub.clients.add(ws);
	if (sub.arming === null && sub.handle === null) {
		// First subscriber — kick off the arm and let concurrent
		// subscribers piggyback on the same promise. Without the dedupe
		// two `subscribe` frames racing through the event loop would
		// both see `handle === null`, both call `armWatcher`, and the
		// first handle would leak while two snapshots would fire.
		sub.arming = armWatcher(sub, projectRoot, subscriptions, watchFactory);
	} else if (sub.handle !== null) {
		// Watcher already armed by an earlier subscriber — give the new
		// client an up-to-date snapshot right away so they don't have to
		// wait for the next change event.
		void rebuildAndBroadcast(sub, projectRoot, subscriptions, watchFactory);
	}
	if (sub.arming !== null) await sub.arming;
	return sub;
}

async function armWatcher(
	sub: Subscription,
	projectRoot: string | undefined,
	subscriptions: Map<string, Subscription>,
	watchFactory: WatchFactory,
): Promise<WatchHandle | null> {
	try {
		const initial = await buildProjectCfg(sub.entry, {
			...(projectRoot !== undefined ? { root: projectRoot } : {}),
		});
		const files = initial.files.map((f) => toAbsolutePath(projectRoot, f.path));
		const rendered = renderProjectFiles(initial.files);
		sendSnapshotTo(
			sub,
			initial.files.map((f) => f.path),
			rendered.mermaid,
		);
		// Stash on the subscription so concurrent subscribers can see
		// the live handle while this promise is still settling.
		sub.handle = watchFactory.watch(files, () => {
			scheduleRebuild(sub, projectRoot, subscriptions, watchFactory);
		});
		return sub.handle;
	} catch (err) {
		sendErrorTo(sub, mapCfgError(err), sub.entry);
		cleanupSubscription(sub, subscriptions);
		return null;
	}
}

function scheduleRebuild(
	sub: Subscription,
	projectRoot: string | undefined,
	subscriptions: Map<string, Subscription>,
	watchFactory: WatchFactory,
): void {
	if (sub.rebuildTimer !== null) clearTimeout(sub.rebuildTimer);
	sub.rebuildTimer = setTimeout(() => {
		sub.rebuildTimer = null;
		void rebuildAndBroadcast(sub, projectRoot, subscriptions, watchFactory);
	}, REBUILD_DEBOUNCE_MS);
}

async function rebuildAndBroadcast(
	sub: Subscription,
	projectRoot: string | undefined,
	subscriptions: Map<string, Subscription>,
	watchFactory: WatchFactory,
): Promise<void> {
	try {
		const project = await buildProjectCfg(sub.entry, {
			...(projectRoot !== undefined ? { root: projectRoot } : {}),
		});
		// Re-arm watches for the new file set (cheap; if the set is
		// unchanged, fs.watch just keeps the existing handles busy).
		if (sub.handle !== null) sub.handle.close();
		const files = project.files.map((f) => toAbsolutePath(projectRoot, f.path));
		sub.handle = watchFactory.watch(files, () =>
			scheduleRebuild(sub, projectRoot, subscriptions, watchFactory),
		);
		const rendered = renderProjectFiles(project.files);
		sendSnapshotTo(
			sub,
			project.files.map((f) => f.path),
			rendered.mermaid,
		);
	} catch (err) {
		sendErrorTo(sub, mapCfgError(err), sub.entry);
	}
}

function detachClient(
	sub: Subscription | null,
	ws: WebSocket,
	subscriptions: Map<string, Subscription>,
): void {
	if (sub === null) return;
	sub.clients.delete(ws);
	if (sub.clients.size === 0) cleanupSubscription(sub, subscriptions);
}

function cleanupSubscription(
	sub: Subscription,
	subscriptions: Map<string, Subscription>,
): void {
	if (sub.rebuildTimer !== null) clearTimeout(sub.rebuildTimer);
	if (sub.handle !== null) sub.handle.close();
	subscriptions.delete(sub.entry);
}

// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------

function send(ws: WebSocket, message: ServerMessage): void {
	if (ws.readyState !== ws.OPEN) return;
	ws.send(JSON.stringify(message));
}

function sendSnapshotTo(
	sub: Subscription,
	files: ReadonlyArray<string>,
	mermaid: string,
): void {
	const msg: ServerMessage = {
		type: "snapshot",
		entry: sub.entry,
		mermaid,
		files,
	};
	for (const ws of sub.clients) send(ws, msg);
}

function sendErrorTo(sub: Subscription, message: string, entry: string): void {
	const msg: ServerMessage = { type: "error", message, entry };
	for (const ws of sub.clients) send(ws, msg);
}

function sendError(ws: WebSocket, message: string): void {
	send(ws, { type: "error", message });
}

function mapCfgError(err: unknown): string {
	if (err instanceof ProjectCfgError) return err.message;
	if (err instanceof Error) return err.message;
	return "Internal error";
}

function isClientMessage(value: unknown): value is ClientMessage {
	if (typeof value !== "object" || value === null) return false;
	const v = value as { type?: unknown; entry?: unknown };
	if (v.type === "ping" || v.type === "unsubscribe") return true;
	if (v.type === "subscribe")
		return typeof v.entry === "string" && v.entry.length > 0;
	return false;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function toAbsolutePath(projectRoot: string | undefined, rel: string): string {
	const root = projectRoot ?? path.join(process.cwd(), "target");
	return path.join(root, rel);
}
