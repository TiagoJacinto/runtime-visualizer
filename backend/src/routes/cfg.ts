import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { analyseProject } from "../cfg/project-analyzer.ts";

const requestSchema = z.object({
	source: z.string().max(1_000_000),
	filePath: z.string().optional(),
	showImports: z.boolean().optional(),
	files: z.record(z.string(), z.string()).optional(),
});

const cfgRoutes: FastifyPluginAsync = async (app) => {
	app.get("/", async () => ({
		ok: true,
		info: "POST { source: string, filePath?: string, showImports?: boolean, files?: Record<string, string> } to build a control-flow graph.",
	}));

	app.post("/", async (req, reply) => {
		const parsed = requestSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const status = issue?.code === "too_big" ? 413 : 400;
			return reply.code(status).send({ error: issue?.message ?? "Invalid request body." });
		}
		const { source, filePath, showImports, files } = parsed.data;
		const analysis = analyseProject({ source, filePath: filePath ?? "inline.ts", files, showImports });
		if (analysis.diagnostics.length > 0) return reply.code(422).send({ ok: false, diagnostics: analysis.diagnostics });
		return { ok: true, cfg: analysis.cfg };
	});
};

export default cfgRoutes;
