import type { FastifyPluginCallback } from "fastify";
import { z } from "zod";

import { parseBody } from "../../../core/validation.ts";

const echoRequestSchema = z.object({
  message: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const echoRoutes: FastifyPluginCallback = (app, _options, done) => {
  app.get("/", () => ({ ok: true }));

  app.post("/", (req) => {
    const body = parseBody(echoRequestSchema, req.body ?? {});
    return {
      ok: true,
      received: {
        contentType: req.headers["content-type"] ?? null,
        message: body.message ?? null,
        metadata: body.metadata ?? null,
      },
    };
  });
  done();
};

export default echoRoutes;
