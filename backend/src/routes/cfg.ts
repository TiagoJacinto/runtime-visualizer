import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { diagnoseProject } from "../cfg/diagnostics.ts";
import { analyseFileProcedure } from "../cfg/file-analyzer.ts";

const requestSchema = z.object({
	source: z.string().max(1_000_000),
	filePath: z.string().optional(),
	files: z.record(z.string(), z.string()).optional(),
});

const cfgRoutes: FastifyPluginAsync = async (app) => {
	app.get("/", async () => ({
		ok: true,
		info: "POST { source: string, filePath?: string, files?: Record<string, string> } to build a control-flow graph.",
	}));

	app.post("/", async (req, reply) => {
		const parsed = requestSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const status = issue?.code === "too_big" ? 413 : 400;
			return reply.code(status).send({ error: issue?.message ?? "Invalid request body." });
		}
		const { source, filePath, files } = parsed.data;
		const selectedPath = filePath ?? "inline.ts";
		const diagnostics = diagnoseProject({ source, filePath: selectedPath, files });
		if (diagnostics.length > 0) return reply.code(422).send({ ok: false, diagnostics });
		const cfg = analyseFileProcedure(source, selectedPath);
		return { ok: true, cfg };
	});
};

export default cfgRoutes;
