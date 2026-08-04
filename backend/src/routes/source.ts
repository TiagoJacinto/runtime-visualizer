import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { discoverProcedures, readSource } from "../source-resources.ts";
import { HttpError } from "../errors.ts";

export type SourceRoutesOptions = {
	readonly filesFolder: string;
};

const querySchema = z.object({
	file: z.string().min(1),
	name: z.string().optional(),
});

type SourceQuery = z.infer<typeof querySchema>;

function sourceQuery(query: unknown): SourceQuery {
	const parsed = querySchema.safeParse(query);
	if (!parsed.success) throw new HttpError(400, "A source file is required.");
	return parsed.data;
}

const sourceRoutes: FastifyPluginAsync<SourceRoutesOptions> = async (app, options) => {
	app.get("/source", async (request) => {
		const { file } = sourceQuery(request.query);
		return readSource(options.filesFolder, file);
	});

	app.get("/procedures", async (request) => {
		const { file, name } = sourceQuery(request.query);
		const resource = await readSource(options.filesFolder, file);
		const procedures = discoverProcedures(resource.source, resource.file);
		const diagnostics =
			name !== undefined &&
			!procedures.some((procedure) => procedure.name === name)
				? [{ procedure: name, reason: "Procedure was not found" }]
				: [];
		return {
			file: resource.file,
			revision: resource.revision,
			procedures,
			...(diagnostics.length > 0 ? { diagnostics } : {}),
		};
	});
};

export default sourceRoutes;
