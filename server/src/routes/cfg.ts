import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { analyseTypeScript } from "../cfg/analyzer.ts";
import { analyseFileProcedure } from "../cfg/file-analyzer.ts";

const requestSchema = z.object({
	source: z.string().max(1_000_000),
	filePath: z.string().optional(),
	procedure: z.enum(["file", "functions"]).default("file"),
});

const cfgRoutes: FastifyPluginAsync = async (app) => {
	app.get("/", async () => ({
		ok: true,
		info: "POST { source: string, filePath?: string } to build a control-flow graph.",
	}));

	app.post("/", async (req, reply) => {
		const parsed = requestSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const status = issue?.code === "too_big" ? 413 : 400;
			return reply.code(status).send({ error: issue?.message ?? "Invalid request body." });
		}
		const { source, filePath, procedure } = parsed.data;
		const cfg = procedure === "functions"
			? analyseTypeScript(source, filePath === undefined ? {} : { filePath })
			: analyseFileProcedure(source, filePath ?? "inline.ts");
		return { ok: true, cfg };
	});
};

export default cfgRoutes;
