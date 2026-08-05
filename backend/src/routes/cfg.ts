import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { analyseProject } from "../cfg/project-analyzer.ts";
import type { RevisionStore } from "../execution/revision-store.ts";
import { isSourceFile, listSourceFiles } from "../source/source-files.ts";
import { readSource } from "../source/source-resources.ts";

const requestSchema = z.object({
	source: z.string().max(1_000_000),
	filePath: z.string().optional(),
	functionName: z
		.string()
		.regex(
			/^[A-Za-z_$][A-Za-z0-9_$]*$/,
			"Function name must be a valid identifier.",
		)
		.optional(),
	showImports: z.boolean().optional(),
	files: z.record(z.string(), z.string()).optional(),
});

const resourceQuery = z.object({
	file: z.string().min(1).optional(),
	name: z
		.string()
		.regex(
			/^[A-Za-z_$][A-Za-z0-9_$]*$/,
			"Procedure name must be a valid identifier.",
		)
		.optional(),
	showImports: z
		.stringbool({ truthy: ["true", "1"], falsy: ["false", "0"] })
		.optional(),
});

type CfgRoutesOptions = {
	readonly filesFolder: string;
	readonly revisionStore: RevisionStore;
};

const cfgRoutes: FastifyPluginAsync<CfgRoutesOptions> = async (
	app,
	options,
) => {
	app.get("/", async (req, reply) => {
		const parsedQuery = resourceQuery.safeParse(req.query);
		if (!parsedQuery.success)
			return reply.code(400).send({
				error: parsedQuery.error.issues[0]?.message ?? "Invalid request query.",
			});
		if (parsedQuery.data.file === undefined)
			return {
				ok: true,
				info: "POST { source: string, filePath?: string, functionName?: string, showImports?: boolean, files?: Record<string, string> } to build a control-flow graph.",
			};
		const resource = await readSource(
			options.filesFolder,
			parsedQuery.data.file,
		);
		const sourceFiles = (await listSourceFiles(options.filesFolder)).filter(
			isSourceFile,
		);
		const entries: Array<readonly [string, string]> = [];
		let nextIndex = 0;
		const readNext = async (): Promise<void> => {
			while (nextIndex < sourceFiles.length) {
				const file = sourceFiles[nextIndex];
				nextIndex += 1;
				if (file === undefined) return;
				entries.push([
					file,
					(await readSource(options.filesFolder, file)).source,
				]);
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(8, sourceFiles.length) }, () => readNext()),
		);
		const files = Object.fromEntries(entries);
		const analysis = analyseProject({
			source: resource.source,
			filePath: resource.file,
			functionName: parsedQuery.data.name,
			files,
			showImports: parsedQuery.data.showImports,
		});
		if (analysis.diagnostics.length > 0)
			return reply.code(422).send({
				ok: false,
				file: resource.file,
				revision: resource.revision,
				diagnostics: analysis.diagnostics,
			});
		const procedure = analysis.cfg?.procedures?.[0];
		if (procedure === undefined)
			return reply.code(422).send({ error: "No executable Procedure found." });
		options.revisionStore.set(
			resource.file,
			parsedQuery.data.name,
			resource.revision,
			{
				source: resource.source,
				filePath: resource.file,
				functionName: parsedQuery.data.name,
				files,
				procedure,
			},
		);
		return {
			ok: true,
			file: resource.file,
			revision: resource.revision,
			cfg: analysis.cfg,
		};
	});

	app.post("/", async (req, reply) => {
		const parsed = requestSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const status = issue?.code === "too_big" ? 413 : 400;
			return reply
				.code(status)
				.send({ error: issue?.message ?? "Invalid request body." });
		}
		const { source, filePath, functionName, showImports, files } = parsed.data;
		const analysis = analyseProject({
			source,
			filePath: filePath ?? "inline.ts",
			functionName,
			files,
			showImports,
		});
		if (analysis.diagnostics.length > 0)
			return reply
				.code(422)
				.send({ ok: false, diagnostics: analysis.diagnostics });
		return { ok: true, cfg: analysis.cfg };
	});
};

export default cfgRoutes;
