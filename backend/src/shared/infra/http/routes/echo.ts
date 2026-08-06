import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parseBody } from "../../../core/validation.ts";

const echoRequestSchema = z.object({
	message: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

const echoRoutes: FastifyPluginAsync = async (app) => {
	app.get("/", async () => ({ ok: true }));

	app.post("/", async (req) => {
		const body = parseBody(echoRequestSchema, req.body ?? {});
		return {
			ok: true,
			received: {
				message: body.message ?? null,
				metadata: body.metadata ?? null,
				contentType: req.headers["content-type"] ?? null,
			},
		};
	});
};

export default echoRoutes;
