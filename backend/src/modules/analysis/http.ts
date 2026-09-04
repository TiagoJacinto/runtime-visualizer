import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { RevisionHistory } from "./revisionHistory.ts";
import type { RevisionStore } from "../execution/infra/revision-store.ts";
import { analyseSavedProcedure } from "./useCases/analyseSavedProcedure/analyse-saved-procedure.ts";
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
  readonly revisionStore?: RevisionStore;
  readonly scheduler?: SavedAnalysisScheduler;
};

const analysisRoutes: FastifyPluginAsync<AnalysisRoutesOptions> = async (
  app,
  options,
) => {
  app.get("/revisions", async (req, reply) => {
    const parsed = revisionsQuerySchema.safeParse(req.query);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid request query." });
    return {
      file: parsed.data.file,
      procedure: parsed.data.procedureId,
      revisions: await options.history.list(parsed.data),
    };
  });
  app.get("/", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success)
      return reply
        .code(400)
        .send({
          error: parsed.error.issues[0]?.message ?? "Invalid request query.",
        });
    let result;
    if (
      options.scheduler !== undefined &&
      parsed.data.procedureId !== undefined &&
      parsed.data.revision === undefined
    ) {
      const procedureId = parsed.data.procedureId;
      try {
        const snapshot = await options.scheduler.analyze(
          { file: parsed.data.file, procedureId },
          "interactive",
        );
        result = { ok: true as const, snapshot };
      } catch (error) {
        result = {
          ok: false as const,
          error: {
            error: error instanceof Error ? error.message : "Analysis failed",
            file: parsed.data.file,
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
        parsed.data,
      );
    }
    if (!result.ok)
      return reply
        .code(result.error.error === "Revision unavailable" ? 404 : 422)
        .send(result.error);
    const executableProcedure = result.snapshot.cfg?.procedures?.[0];
    if (options.revisionStore && executableProcedure)
      options.revisionStore.set(
        result.snapshot.file,
        result.snapshot.procedure.name ?? undefined,
        result.snapshot.revision,
        {
          source: result.snapshot.source,
          filePath: result.snapshot.file,
          functionName: result.snapshot.procedure.name ?? undefined,
          files: { ...result.snapshot.files },
          procedure: executableProcedure,
        },
      );
    return { ...result.snapshot, procedureId: result.snapshot.procedure.id };
  });
};
export { analysisRoutes };
