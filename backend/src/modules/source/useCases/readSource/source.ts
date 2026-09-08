import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { discoverProcedures } from "../discoverProcedures/discover-procedures.ts";
import { readSource } from "./read-source.ts";
import { parseQuery } from "../../../../shared/index.ts";

export type SourceRoutesOptions = {
	readonly filesFolder: string;
};

const querySchema = z.object({
	file: z.string().min(1),
	name: z.string().optional(),
});

type SourceQuery = z.output<typeof querySchema>;

function sourceInput(query: unknown): SourceQuery {
	const parsed = parseQuery(querySchema, query);
	return {
		file: parsed.file,
		name: parsed.name,
	};
}

const sourceRoutes: FastifyPluginAsync<SourceRoutesOptions> = async (
	app,
	options,
) => {
	app.get("/source", async (request) => {
		const input = sourceInput(request.query);
		return readSource(options.filesFolder, input.file);
	});

	app.get("/procedures", async (request) => {
		const input = sourceInput(request.query);
		const { file, name } = input;
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
