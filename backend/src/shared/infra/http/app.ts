import Fastify, { type FastifyInstance } from "fastify";
import { HttpError, loadSettings } from "../../index.ts";
import { analysisRoutes } from "../../../modules/analysis/http.ts";
import {
	InMemoryRevisionHistory,
	type RevisionHistory,
} from "../../../modules/analysis/index.ts";
import { join } from "node:path";
import { WorkspaceEventHub } from "../../../modules/workspace/eventHub.ts";
import {
	RevisionBuildQueue,
	createSavedAnalysisScheduler,
} from "../../../modules/analysis/index.ts";
import { DefaultRevisionBuilderWorkerClient } from "../../../modules/analysis/infra/revisionBuilderWorkerClient.ts";
import { cfgRoutes } from "../../../modules/cfg/http.ts";
import { DefaultExecutionManager } from "../../../modules/execution/useCases/executionManager.ts";
import { executeRoutes } from "../../../modules/execution/http.ts";
import {
	eventsRoutes,
	filesRoutes,
	sourceRoutes,
	SourceChangeWatcher,
} from "../../../modules/source/http.ts";
import healthRoutes from "./routes/health.ts";
import runtimeRoutes from "./routes/runtime.ts";
import echoRoutes from "./routes/echo.ts";

export type AppOptions = {
	readonly now?: () => Date;
	/** Use an explicit history database (primarily for isolated acceptance runs). */
	readonly databasePath?: string;
	/** Timeout applied to each server-owned execution. */
	readonly executionTimeoutMs?: number;
	/** Hook used by tests to register extra routes. */
	readonly registerTestRoutes?: (app: FastifyInstance) => void;
	/** Folder whose files are exposed via `GET /api/files` (defaults to `settings.json:filesFolder`). */
	readonly filesFolder?: string;
};

/**
 * Builds a Fastify instance with the same routes/handlers the old
 * app exposed. Async because Fastify is async-first.
 *
 * The 404 + error handlers MUST be registered before the route
 * plugins so Fastify's encapsulation picks them up for every plugin
 * context. Registering them after would leave the plugins using the
 * built-in `{ statusCode, error, message }` default.
 */
export async function createApp(
	options: AppOptions = {},
): Promise<FastifyInstance> {
	const app = Fastify({
		// Disable Fastify's own logger; we log via the onResponse hook
		// below to keep the output identical to the old version.
		logger: false,
		// Match the old 64 KiB JSON-body cap.
		bodyLimit: 64 * 1024,
	});

	app.setNotFoundHandler((_req, reply) => {
		reply.code(404).send({ error: "Not Found" });
	});

	app.setErrorHandler((err, _req, reply) => {
		if (err instanceof HttpError) {
			reply.code(err.status).send({ error: err.message });
			return;
		}
		// Fastify wraps any thrown non-Error value with a generic
		// "Non-Error thrown" message; hide the wrapper and return a
		// generic message instead, matching the old behaviour.
		const isFastifyNonErrorWrap =
			err instanceof Error && err.message.startsWith("Non-Error thrown");
		let message = "Internal Server Error";
		if (!isFastifyNonErrorWrap && err instanceof Error) message = err.message;
		console.error("[server] unhandled error:", err);
		reply.code(500).send({ error: message });
	});

	app.addHook("onResponse", async (req, reply) => {
		console.log(
			`[server] ${req.method} ${req.url} (${Math.round(reply.elapsedTime)}ms)`,
		);
	});

	await app.register(healthRoutes, { prefix: "/api/health", now: options.now });
	await app.register(runtimeRoutes, {
		prefix: "/api/runtime",
		now: options.now,
	});
	const filesFolder = options.filesFolder ?? loadSettings().filesFolder;
	let history: RevisionHistory = new InMemoryRevisionHistory(options.now);
	// Tests default to an in-memory store for isolation, but an explicit path
	// opts into the same SQLite authority used by production. This keeps restart
	// and source-deletion acceptance tests honest without sharing local state.
	const useSqlite =
		process.env.VITEST === undefined ||
		(options.databasePath !== undefined && typeof globalThis.Bun !== "undefined");
	if (useSqlite) {
		const { SqliteRevisionHistory } = await import(
			"../../../modules/analysis/infra/sqliteRevisionHistory.ts"
		);
		history = new SqliteRevisionHistory(
			options.databasePath ??
				join(process.cwd(), ".runtime-visualizer", "revisions.sqlite"),
			options.now,
		);
	}
	const eventHub = new WorkspaceEventHub();
	const executionManager = new DefaultExecutionManager(history, {
		executionTimeoutMs: options.executionTimeoutMs,
		now: options.now,
	});
	const executionSubscription = executionManager.subscribe((update) =>
		eventHub.publish({ type: "execution-update", update }),
	);
	const revisionWorker = new DefaultRevisionBuilderWorkerClient();
	const revisionQueue = new RevisionBuildQueue(filesFolder, history, {
		workerClient: revisionWorker,
		onReady: (snapshot) =>
			eventHub.publish({
				type: "revision-ready",
				revision: {
					file: snapshot.file,
					procedureId: snapshot.procedure.id,
					revision: snapshot.revision,
					analyzedAt: snapshot.analyzedAt,
					runnable: snapshot.cfg !== null && snapshot.diagnostics.length === 0,
					diagnosticCount: snapshot.diagnostics.length,
				},
			}),
		onFailure: (paths, error) =>
			eventHub.publish({
				type: "revision-build-failed",
				paths: [...paths],
				error: error.message,
			}),
	});
	const sourceChangeWatcher = new SourceChangeWatcher(filesFolder);
	const scheduler = createSavedAnalysisScheduler(filesFolder, history, {
		queue: revisionQueue,
	});
	// Baseline indexing is deliberately deferred so the server can accept Workspace connections first.
	const baselineTimer = setTimeout(
		() => revisionQueue.enqueueAffected([], "baseline"),
		250,
	);
	app.addHook("onClose", async () => {
		clearTimeout(baselineTimer);
		sourceChangeWatcher.close();
		scheduler.close();
		executionSubscription();
		executionManager.close();
		eventHub.close();
		history.close?.();
	});
	await app.register(echoRoutes, { prefix: "/api/echo" });
	await app.register(analysisRoutes, {
		prefix: "/api/analysis",
		filesFolder,
		history,
		scheduler,
	});
	await app.register(cfgRoutes, {
		prefix: "/api/cfg",
		filesFolder,
	});
	await app.register(executeRoutes, {
		prefix: "/api/execute",
		manager: executionManager,
	});
	await app.register(filesRoutes, {
		prefix: "/api/files",
		filesFolder,
	});
	await app.register(sourceRoutes, {
		prefix: "/api",
		filesFolder,
	});
	await app.register(eventsRoutes, {
		prefix: "/api/events",
		watcher: sourceChangeWatcher,
		hub: eventHub,
		activeExecutions: () => [...executionManager.listActive()],
		onChange: (change) => revisionQueue.enqueueAffected([change.file], "change"),
	});

	if (options.registerTestRoutes) {
		options.registerTestRoutes(app);
	}

	return app;
}
