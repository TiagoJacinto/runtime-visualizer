import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import { z } from "zod";

import { parseQuery } from "../../../../shared/index.ts";
import { discoverProcedures } from "../discoverProcedures/discover-procedures.ts";
import { readSource } from "./read-source.ts";

export interface SourceRoutesOptions {
  readonly filesFolder: string;
}
const querySchema = z.object({
  file: z.string().min(1),
  name: z.string().optional(),
});
type SourceQuery = z.output<typeof querySchema>;
type SourceQueryInput = z.input<typeof querySchema>;
const sourceInput = (query: SourceQueryInput): SourceQuery => {
  const parsed = parseQuery(querySchema, query);
  return {
    file: parsed.file,
    name: parsed.name,
  };
};
const sourceRoutes: FastifyPluginCallback<SourceRoutesOptions> = (
  app,
  options,
  done
) => {
  app.get<{ Querystring: SourceQueryInput }>("/source", (request) => {
    const input = sourceInput(request.query);
    return readSource(options.filesFolder, input.file);
  });
  const handleProcedures = async (
    request: FastifyRequest<{ Querystring: SourceQueryInput }>
  ) => {
    const input = sourceInput(request.query);
    const { file, name } = input;
    const resource = await readSource(options.filesFolder, file);
    const procedures = discoverProcedures(resource.source, resource.file);
    const diagnostics =
      name !== undefined &&
      !procedures.some((procedure) => procedure.name === name)
        ? [{ procedure: name, reason: "Procedure was not found" }]
        : [];
    const response = {
      file: resource.file,
      procedures,
      revision: resource.revision,
    };
    if (diagnostics.length > 0) {
      return { ...response, diagnostics };
    }
    return response;
  };
  app.get<{ Querystring: SourceQueryInput }>("/procedures", (request) =>
    handleProcedures(request)
  );
  done();
};
export default sourceRoutes;
