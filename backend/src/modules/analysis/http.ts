import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { RevisionStore } from "../execution/infra/revision-store.ts";
import { analyseSavedProcedure } from "./useCases/analyseSavedProcedure/analyse-saved-procedure.ts";

const querySchema = z.object({
	file: z.string().min(1),
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

type AnalysisRoutesOptions = {
	readonly filesFolder: string;
	readonly revisionStore: RevisionStore;
};

const analysisRoutes: FastifyPluginAsync<AnalysisRoutesOptions> = async (
	app,
	options,
) => {
	app.get("/", async (req, reply) => {
		const parsed = querySchema.safeParse(req.query);
		if (!parsed.success)
			return reply.code(400).send({
				error:
					parsed.error.issues[0]?.message ?? "Invalid request query.",
			});

		const result = await analyseSavedProcedure(
			options.filesFolder,
			options.revisionStore,
			{
				file: parsed.data.file,
				name: parsed.data.name,
				showImports: parsed.data.showImports,
			},
		);

		if (!result.ok) {
			return reply.code(422).send(result.error);
		}

		return result.snapshot;
	});
};

export { analysisRoutes };
