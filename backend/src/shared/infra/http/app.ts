import path from "node:path";

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { analysisRoutes } from "../../../modules/analysis/http.ts";
import {
  createSavedAnalysisScheduler,
  DefaultRevisionBuilderWorkerClient,
  InMemoryRevisionHistory,
  RevisionBuildQueue,
} from "../../../modules/analysis/index.ts";
import type { RevisionHistory } from "../../../modules/analysis/index.ts";
import { cfgRoutes } from "../../../modules/cfg/http.ts";
import { executeRoutes } from "../../../modules/execution/http.ts";
import { DefaultExecutionManager } from "../../../modules/execution/index.ts";
import {
  eventsRoutes,
  filesRoutes,
  sourceRoutes,
  SourceChangeWatcher,
} from "../../../modules/source/http.ts";
import { WorkspaceEventHub } from "../../../modules/workspace/index.ts";
import { HttpError } from "../../core/errors.ts";
import { loadSettings } from "../config/settings.ts";
import echoRoutes from "./routes/echo.ts";
import healthRoutes from "./routes/health.ts";
import runtimeRoutes from "./routes/runtime.ts";

const handleError: Parameters<FastifyInstance["setErrorHandler"]>[0] = (
  err,
  _req,
  reply
) => {
  if (err instanceof HttpError) {
    reply.code(err.status).send(err.body);
    return;
  }
  // Fastify wraps any thrown non-Error value with a generic
  // "Non-Error thrown" message; hide the wrapper and return a
  // generic message instead, matching the old behaviour.
  const isFastifyNonErrorWrap =
    err instanceof Error && err.message.startsWith("Non-Error thrown");
  let message = "Internal Server Error";
  if (!isFastifyNonErrorWrap && err instanceof Error) {
    const { message: errorMessage } = err;
    message = errorMessage;
  }
  console.error("[server] unhandled error:", err);
  reply.code(500).send({ error: message });
};

export interface AppOptions {
  readonly now?: () => Date;
  /** Use an explicit history database (primarily for isolated acceptance runs). */
  readonly databasePath?: string;
  /** Timeout applied to each server-owned execution. */
  readonly executionTimeoutMs?: number;
  /** Hook used by tests to register extra routes. */
  readonly registerTestRoutes?: (app: FastifyInstance) => void;
  /** Folder whose files are exposed via `GET /api/files` (defaults to `settings.json:filesFolder`). */
  readonly filesFolder?: string;
}
/**
 * Builds a Fastify instance with the same routes/handlers the old
 * app exposed. Async because Fastify is async-first.
 *
 * The 404 + error handlers MUST be registered before the route
 * plugins so Fastify's encapsulation picks them up for every plugin
 * context. Registering them after would leave the plugins using the
 * built-in `{ statusCode, error, message }` default.
 */
export const createApp = async (
  options: AppOptions = {}
): Promise<FastifyInstance> => {
  const app = Fastify({
    // Match the old 64 KiB JSON-body cap.
    bodyLimit: 64 * 1024,
    // Disable Fastify's own logger; we log via the onResponse hook
    // below to keep the output identical to the old version.
    logger: false,
  });
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: "Not Found" });
  });
  app.setErrorHandler(handleError);
  app.addHook("onResponse", (req, reply) => {
    console.log(
      `[server] ${req.method} ${req.url} (${Math.round(reply.elapsedTime)}ms)`
    );
  });
  await app.register(healthRoutes, { now: options.now, prefix: "/api/health" });
  await app.register(runtimeRoutes, {
    now: options.now,
    prefix: "/api/runtime",
  });
  const filesFolder = options.filesFolder ?? loadSettings().filesFolder;
  let history: RevisionHistory = new InMemoryRevisionHistory(options.now);
  // Tests default to an in-memory store for isolation, but an explicit path
  // opts into the same SQLite authority used by production. This keeps restart
  // and source-deletion acceptance tests honest without sharing local state.
  const useSqlite =
    process.env.VITEST === undefined ||
    (options.databasePath !== undefined && globalThis.Bun !== undefined);
  if (useSqlite) {
    const { SqliteRevisionHistory } =
      await import("../../../modules/analysis/persistence.ts");
    history = new SqliteRevisionHistory(
      options.databasePath ??
        path.join(process.cwd(), ".runtime-visualizer", "revisions.sqlite"),
      options.now
    );
  }
  const eventHub = new WorkspaceEventHub();
  const executionManager = new DefaultExecutionManager(history, {
    executionTimeoutMs: options.executionTimeoutMs,
    now: options.now,
  });
  const executionSubscription = executionManager.subscribe((update) =>
    eventHub.publish({ type: "execution-update", update })
  );
  const revisionWorker = new DefaultRevisionBuilderWorkerClient();
  const revisionQueue = new RevisionBuildQueue(filesFolder, history, {
    onFailure: (paths, error) =>
      eventHub.publish({
        error: error.message,
        paths: [...paths],
        type: "revision-build-failed",
      }),
    onReady: (snapshot) =>
      eventHub.publish({
        revision: {
          analyzedAt: snapshot.analyzedAt,
          diagnosticCount: snapshot.diagnostics.length,
          file: snapshot.file,
          procedureId: snapshot.procedure.id,
          revision: snapshot.revision,
          runnable: snapshot.cfg !== null && snapshot.diagnostics.length === 0,
        },
        type: "revision-ready",
      }),
    workerClient: revisionWorker,
  });
  const sourceChangeWatcher = new SourceChangeWatcher(filesFolder);
  const scheduler = createSavedAnalysisScheduler(filesFolder, history, {
    queue: revisionQueue,
  });
  // Baseline indexing is deliberately deferred so the server can accept Workspace connections first.
  const baselineTimer = setTimeout(
    () => revisionQueue.enqueueAffected([], "baseline"),
    250
  );
  app.addHook("onClose", () => {
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
    filesFolder,
    history,
    prefix: "/api/analysis",
    scheduler,
  });
  await app.register(cfgRoutes, {
    filesFolder,
    prefix: "/api/cfg",
  });
  await app.register(executeRoutes, {
    manager: executionManager,
    prefix: "/api/execute",
  });
  await app.register(filesRoutes, {
    filesFolder,
    prefix: "/api/files",
  });
  await app.register(sourceRoutes, {
    filesFolder,
    prefix: "/api",
  });
  await app.register(eventsRoutes, {
    activeExecutions: () => [...executionManager.listActive()],
    hub: eventHub,
    onChange: (change) =>
      revisionQueue.enqueueAffected([change.file], "change"),
    prefix: "/api/events",
    watcher: sourceChangeWatcher,
  });
  if (options.registerTestRoutes) {
    options.registerTestRoutes(app);
  }
  return app;
};
