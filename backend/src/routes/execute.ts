import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { analyseProject } from "../cfg/project-analyzer.ts";
import { executeProcedure } from "../execution/runner.ts";

const requestSchema = z.object({
	source: z.string().max(1_000_000),
	filePath: z.string().optional(),
	files: z.record(z.string(), z.string()).optional(),
});

const executeRoutes: FastifyPluginAsync = async (app) => {
	app.post("/", async (req, reply) => {
		const parsed = requestSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const status = issue?.code === "too_big" ? 413 : 400;
			return reply.code(status).send({ error: issue?.message ?? "Invalid request body." });
		}

		const { source, filePath = "inline.ts", files } = parsed.data;
		const analysis = analyseProject({ source, filePath, files });
		if (analysis.diagnostics.length > 0) {
			return reply.code(422).send({ ok: false, diagnostics: analysis.diagnostics });
		}
		const procedure = analysis.cfg?.procedures?.[0];
		if (procedure === undefined) return reply.code(422).send({ error: "No executable Procedure found." });

		const execution = executeProcedure(source, filePath, procedure);
		return {
			ok: execution.status === "Succeeded",
			events: execution.events.map((nodeId) => ({ nodeId })),
			result: {
				status: execution.status,
				...(execution.error === undefined ? {} : { error: execution.error }),
			},
		};
	});
};

export default executeRoutes;
