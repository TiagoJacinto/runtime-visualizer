const DEFAULT_BACKEND_PORT = 3000;
const BACKEND_STARTUP_TIMEOUT_MS = 10_000;
const HEALTH_CHECK_INTERVAL_MS = 100;

type ChildProcess = ReturnType<typeof Bun.spawn>;

const parsePort = (value: string | undefined): number => {
  const port = Math.trunc(Number(value ?? DEFAULT_BACKEND_PORT));
  if (!Number.isFinite(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid development port: ${value ?? ""}`);
  }
  return port;
};

const findAvailablePort = (startPort: number, host: string): number => {
  for (let port = startPort; port <= 65_535; port += 1) {
    try {
      const server = Bun.listen({
        hostname: host,
        port,
        socket: {
          data(socket) {
            socket.end();
          },
        },
      });
      server.stop();
      return port;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "EADDRINUSE") {
        throw error;
      }
    }
  }
  throw new Error(`No available development ports from ${startPort}`);
};

const waitForBackend = async (
  port: number,
  backend: ChildProcess
): Promise<void> => {
  const deadline = Date.now() + BACKEND_STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The backend may still be starting.
    }
    await Bun.sleep(HEALTH_CHECK_INTERVAL_MS);
  }
  backend.kill();
  throw new Error(
    `Backend did not become healthy on port ${port} within ${BACKEND_STARTUP_TIMEOUT_MS}ms`
  );
};

const stop = (child: ChildProcess | undefined): void => {
  if (child !== undefined) {
    child.kill();
  }
};

const main = async (): Promise<void> => {
  const host = process.env.HOST ?? "0.0.0.0";
  const backendPort = findAvailablePort(parsePort(process.env.PORT), host);
  const backendEnv = {
    ...process.env,
    PORT: String(backendPort),
  } as Record<string, string>;

  console.log(`[dev] starting backend on port ${backendPort}`);
  const backend = Bun.spawn(["bun", "run", "backend:dev"], {
    env: backendEnv,
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  });
  let frontend: ChildProcess | undefined;
  const stopChildren = (): void => {
    stop(frontend);
    stop(backend);
  };
  process.on("SIGINT", stopChildren);
  process.on("SIGTERM", stopChildren);

  try {
    await waitForBackend(backendPort, backend);
    console.log(
      `[dev] backend is healthy; proxying frontend API to ${backendPort}`
    );
    frontend = Bun.spawn(["bun", "run", "frontend:dev"], {
      env: {
        ...process.env,
        VITE_API_PORT: String(backendPort),
      } as Record<string, string>,
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    });
    await Promise.race([backend.exited, frontend.exited]);
  } finally {
    stopChildren();
    await Promise.all([backend.exited, frontend?.exited].filter(Boolean));
  }
};

await main();
