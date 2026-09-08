import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError, parseQuery } from "../../shared/index.ts";
import type { RevisionHistory } from "./revisionHistory.ts";
import {
  analyseSavedProcedure,
  type AnalyseSavedProcedureInput,
} from "./useCases/analyseSavedProcedure/analyse-saved-procedure.ts";
import type { SavedAnalysisScheduler } from "./useCases/savedAnalysisScheduler.ts";

const querySchema = z.object({
  file: z.string().min(1),
  procedureId: z.string().min(1).optional(),
  name: z
    .string()
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/)
    .optional(),
  revision: z.string().min(1).optional(),
  showImports: z
    .stringbool({ truthy: ["true", "1"], falsy: ["false", "0"] })
    .optional(),
});
const revisionsQuerySchema = z.object({
  file: z.string().min(1),
  procedureId: z.string().min(1),
});
type AnalysisRoutesOptions = {
  readonly filesFolder: string;
  readonly history: RevisionHistory;
  readonly scheduler?: SavedAnalysisScheduler;
};
type AnalysisQuery = z.output<typeof querySchema>;
type RevisionsQuery = z.output<typeof revisionsQuerySchema>;

function toAnalysisInput(query: AnalysisQuery): AnalyseSavedProcedureInput {
  return {
    file: query.file,
    procedureId: query.procedureId,
    name: query.name,
    revision: query.revision,
    showImports: query.showImports,
  };
}

function toRevisionScope(query: RevisionsQuery): {
  readonly file: string;
  readonly procedureId: string;
} {
  return { file: query.file, procedureId: query.procedureId };
}

const analysisRoutes: FastifyPluginAsync<AnalysisRoutesOptions> = async (
  app,
  options,
) => {
  app.get("/revisions", async (req) => {
    const query = parseQuery(revisionsQuerySchema, req.query);
    const scope = toRevisionScope(query);
    return {
      file: scope.file,
      procedure: scope.procedureId,
      revisions: await options.history.list(scope),
    };
  });
  app.get("/", async (req) => {
    const query = parseQuery(querySchema, req.query);
    const input = toAnalysisInput(query);
    let result;
    if (
      options.scheduler !== undefined &&
      input.procedureId !== undefined &&
      input.revision === undefined
    ) {
      const procedureId = input.procedureId;
      try {
        const snapshot = await options.scheduler.analyze(
          { file: input.file, procedureId },
          "interactive",
        );
        result = { ok: true as const, snapshot };
      } catch (error) {
        result = {
          ok: false as const,
          error: {
            error: error instanceof Error ? error.message : "Analysis failed",
            file: input.file,
            procedureId,
            revision: "",
            source: "",
            procedures: [],
            diagnostics: [],
          },
        };
      }
    } else {
      result = await analyseSavedProcedure(
        options.filesFolder,
        options.history,
        input,
      );
    }
    if (!result.ok) {
      const status = result.error.error === "Revision unavailable" ? 404 : 422;
      throw new HttpError(status, result.error.error, result.error);
    }
    return { ...result.snapshot, procedureId: result.snapshot.procedure.id };
  });
};
export { analysisRoutes };
