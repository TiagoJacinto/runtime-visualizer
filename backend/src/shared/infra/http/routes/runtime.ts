import type { FastifyPluginCallback } from "fastify";

export interface RuntimeRoutesOptions {
  readonly now?: () => Date;
}

interface RuntimePayload {
  readonly node: {
    readonly version: string;
    readonly platform: NodeJS.Platform;
    readonly arch: string;
    readonly pid: number;
  };
  readonly bun: {
    readonly version: string | null;
  };
  readonly memory: {
    readonly rssBytes: number;
    readonly heapUsedBytes: number;
    readonly heapTotalBytes: number;
  };
  readonly timestamp: string;
}

const runtimeRoutes: FastifyPluginCallback<RuntimeRoutesOptions> = (
  app,
  options,
  done
) => {
  const now = options.now ?? (() => new Date());

  app.get("/", (): RuntimePayload => {
    const memoryUsage = process.memoryUsage();
    const bunVersion = globalThis.Bun?.version ?? null;

    return {
      bun: {
        version: bunVersion,
      },
      memory: {
        heapTotalBytes: memoryUsage.heapTotal,
        heapUsedBytes: memoryUsage.heapUsed,
        rssBytes: memoryUsage.rss,
      },
      node: {
        arch: process.arch,
        pid: process.pid,
        platform: process.platform,
        version: process.version,
      },
      timestamp: now().toISOString(),
    };
  });

  app.get("/memory", () => {
    const memoryUsage = process.memoryUsage();
    return {
      externalBytes: memoryUsage.external,
      heapTotalBytes: memoryUsage.heapTotal,
      heapUsedBytes: memoryUsage.heapUsed,
      rssBytes: memoryUsage.rss,
      timestamp: now().toISOString(),
    };
  });

  app.get("/uptime", () => ({
    timestamp: now().toISOString(),
    uptimeMs: Math.round(process.uptime() * 1000),
  }));
  done();
};

export default runtimeRoutes;
