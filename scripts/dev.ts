const DEFAULT_BACKEND_PORT = 3000;
const BACKEND_STARTUP_TIMEOUT_MS = 30_000;

type ChildProcess = ReturnType<typeof Bun.spawn>;

const definedEnvironment = (
  environment: Record<string, string | undefined>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  );

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
  backend: ChildProcess,
  backendReady: Promise<null>
): Promise<void> => {
  const startupTimeout = Promise.withResolvers<never>();
  const timeout = setTimeout(
    () =>
      startupTimeout.reject(
        new Error(
          `Backend did not become ready on port ${port} within ${BACKEND_STARTUP_TIMEOUT_MS}ms`
        )
      ),
    BACKEND_STARTUP_TIMEOUT_MS
  );

  try {
    await Promise.race([
      backendReady,
      backend.exited.then((exitCode) => {
        throw new Error(
          `Backend exited with code ${exitCode} before becoming ready on port ${port}`
        );
      }),
      startupTimeout.promise,
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

const stop = (child: ChildProcess | undefined): void => {
  if (child !== undefined) {
    child.kill();
  }
};

const main = async (): Promise<void> => {
  const host = process.env.HOST ?? "0.0.0.0";
  const backendPort = findAvailablePort(parsePort(process.env.PORT), host);
  const backendEnv = definedEnvironment({
    ...process.env,
    PORT: String(backendPort),
  });

  console.log(`[dev] starting backend on port ${backendPort}`);
  const {
    promise: backendReady,
    resolve: resolveBackendReady,
  } = Promise.withResolvers<null>();
  const backend = Bun.spawn(["bun", "--hot", "run", "backend/src/index.ts"], {
    env: backendEnv,
    ipc(message) {
      if (message === "backend-ready") {
        resolveBackendReady(null);
      }
    },
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
    await waitForBackend(backendPort, backend, backendReady);
    console.log(
      `[dev] backend is ready; proxying frontend API to ${backendPort}`
    );
    frontend = Bun.spawn(["bun", "run", "frontend:dev"], {
      env: definedEnvironment({
        ...process.env,
        VITE_API_PORT: String(backendPort),
      }),
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
