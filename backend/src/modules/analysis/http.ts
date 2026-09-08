import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import { z } from "zod";

import { HttpError, parseQuery } from "../../shared/index.ts";
import type { RevisionHistory } from "./revision-history.ts";
import { analyseSavedProcedure } from "./useCases/analyseSavedProcedure/analyse-saved-procedure.ts";
import type { AnalyseSavedProcedureInput } from "./useCases/analyseSavedProcedure/analyse-saved-procedure.ts";
import type { SavedAnalysisScheduler } from "./useCases/saved-analysis-scheduler.ts";

const querySchema = z.object({
  file: z.string().min(1),
  name: z
    .string()
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/u)
    .optional(),
  procedureId: z.string().min(1).optional(),
  revision: z.string().min(1).optional(),
  showImports: z
    .stringbool({ falsy: ["false", "0"], truthy: ["true", "1"] })
    .optional(),
});
const revisionsQuerySchema = z.object({
  file: z.string().min(1),
  procedureId: z.string().min(1),
});
interface AnalysisRoutesOptions {
  readonly filesFolder: string;
  readonly history: RevisionHistory;
  readonly scheduler?: SavedAnalysisScheduler;
}
type AnalysisQuery = z.output<typeof querySchema>;
type RevisionsQuery = z.output<typeof revisionsQuerySchema>;
interface RevisionScope {
  readonly file: string;
  readonly procedureId: string;
}
type AnalysisResult = Awaited<ReturnType<typeof analyseSavedProcedure>>;
const toAnalysisInput = (query: AnalysisQuery): AnalyseSavedProcedureInput => ({
  file: query.file,
  name: query.name,
  procedureId: query.procedureId,
  revision: query.revision,
  showImports: query.showImports,
});
const toRevisionScope = (query: RevisionsQuery): RevisionScope => ({
  file: query.file,
  procedureId: query.procedureId,
});
const handleRevisions = async (
  request: FastifyRequest,
  options: AnalysisRoutesOptions
) => {
  const query = parseQuery(revisionsQuerySchema, request.query);
  const scope = toRevisionScope(query);
  return {
    file: scope.file,
    procedure: scope.procedureId,
    revisions: await options.history.list(scope),
  };
};
const handleAnalysis = async (
  request: FastifyRequest,
  options: AnalysisRoutesOptions
): Promise<AnalysisResult> => {
  const query = parseQuery(querySchema, request.query);
  const input = toAnalysisInput(query);
  let result: AnalysisResult;
  if (
    options.scheduler !== undefined &&
    input.procedureId !== undefined &&
    input.revision === undefined
  ) {
    const { procedureId } = input;
    try {
      const snapshot = await options.scheduler.analyze(
        { file: input.file, procedureId },
        "interactive"
      );
      result = { ok: true, snapshot };
    } catch (error) {
      result = {
        error: {
          diagnostics: [],
          error: error instanceof Error ? error.message : "Analysis failed",
          file: input.file,
          procedureId,
          procedures: [],
          revision: "",
          source: "",
        },
        ok: false,
      };
    }
  } else {
    result = await analyseSavedProcedure(
      options.filesFolder,
      options.history,
      input
    );
  }
  return result;
};
const handleAnalysisResponse = async (
  request: FastifyRequest,
  options: AnalysisRoutesOptions
) => {
  const result = await handleAnalysis(request, options);
  if (!result.ok) {
    const status = result.error.error === "Revision unavailable" ? 404 : 422;
    throw new HttpError(status, result.error.error, result.error);
  }
  return { ...result.snapshot, procedureId: result.snapshot.procedure.id };
};
const analysisRoutes: FastifyPluginCallback<AnalysisRoutesOptions> = (
  app,
  options,
  done
) => {
  app.get("/revisions", (request) => handleRevisions(request, options));
  app.get("/", (request) => handleAnalysisResponse(request, options));
  done();
};
export { analysisRoutes };
