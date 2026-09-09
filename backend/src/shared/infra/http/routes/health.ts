import type { FastifyPluginCallback } from "fastify";

export interface HealthRoutesOptions {
  readonly now?: () => Date;
}

const healthRoutes: FastifyPluginCallback<HealthRoutesOptions> = (
  app,
  options,
  done
) => {
  const now = options.now ?? (() => new Date());

  app.get("/", () => ({
    status: "ok",
    timestamp: now().toISOString(),
    uptimeMs: Math.round(process.uptime() * 1000),
  }));
  done();
};

export default healthRoutes;
