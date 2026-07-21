import type { FastifyPluginAsync } from "fastify";
import { analyseTypeScript } from "../cfg/analyzer.ts";
import { buildProjectCfg, ProjectCfgError } from "../cfg/project.ts";
import { HttpError } from "../errors.ts";
import { z } from "zod";
import { parseBody } from "../validation.ts";

const cfgRequestSchema = z.object({
	source: z
		.string({
			error: "`source` must be a string containing TypeScript source code.",
		})
		.min(1, "`source` must not be empty."),
	filePath: z.string().optional(),
});

const cfgProjectSchema = z.object({
	entry: z
		.string({
			error: "`entry` must be a non-empty path relative to the project root.",
		})
		.min(1, "`entry` must be a non-empty path relative to the project root."),
	root: z.string().optional(),
});

const MAX_SOURCE_BYTES = 60_000;

export type CfgRoutesOptions = {
	/** Project root for the `/api/cfg/project` endpoint. */
	readonly projectRoot?: string;
};

const cfgRoutes: FastifyPluginAsync<CfgRoutesOptions> = async (
	app,
	options,
) => {
	app.get("/", async () => ({
		ok: true,
		info: "POST { source: string, filePath?: string } to build a control-flow graph, or POST /api/cfg/project { entry: string } to build the import-subgraph.",
	}));

	app.post("/", async (req) => {
		const body = parseBody(cfgRequestSchema, req.body ?? {});

		if (body.source.length > MAX_SOURCE_BYTES) {
			throw new HttpError(
				413,
				`\`source\` exceeds the maximum size of ${MAX_SOURCE_BYTES} bytes.`,
			);
		}

		const cfg = analyseTypeScript(body.source, {
			...(typeof body.filePath === "string" ? { filePath: body.filePath } : {}),
		});

		return { ok: true, cfg };
	});

	app.post("/project", async (req) => {
		const body = parseBody(cfgProjectSchema, req.body ?? {});

		const project = await buildProjectCfg(body.entry, {
			...(options.projectRoot !== undefined
				? { root: options.projectRoot }
				: {}),
			...(typeof body.root === "string" ? { root: body.root } : {}),
		}).catch((err: unknown): never => {
			if (err instanceof ProjectCfgError) {
				throw new HttpError(err.status, err.message);
			}
			throw err;
		});

		return { ok: true, project };
	});
};

export default cfgRoutes;
