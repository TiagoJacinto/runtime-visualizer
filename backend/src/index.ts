import { createApp } from "./shared/infra/http/index.ts";

const port = Math.trunc(Number(process.env.PORT ?? "3000"));
const host = process.env.HOST ?? "0.0.0.0";

if (!Number.isFinite(port) || port <= 0 || port > 65_535) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ""}`);
}

const app = await createApp({
  databasePath: process.env.RUNTIME_VISUALIZER_DATABASE_PATH,
  filesFolder: process.env.RUNTIME_VISUALIZER_FILES_FOLDER,
});

await app.listen({ host, port });
console.log(`[server] listening on http://${host}:${port}`);

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  console.log(`[server] received ${signal}, shutting down`);
  try {
    await app.close();
  } catch (error) {
    console.error("[server] error during shutdown:", error);
    process.exit(1);
  }
  process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, (s) => {
    void shutdown(s);
  });
}
