import { z } from "zod";

export const ProcedureScopeSchema = z.object({
  file: z.string().min(1),
  procedureId: z.string().min(1),
});

export const RevisionKeySchema = ProcedureScopeSchema.extend({
  revision: z.string().min(1),
});

export const RevisionSummarySchema = RevisionKeySchema.extend({
  analyzedAt: z.string().datetime(),
  runnable: z.boolean(),
  diagnosticCount: z.number().int().nonnegative(),
});

export const RevisionHistoryResponseSchema = z.object({
  file: z.string(),
  procedure: z.string(),
  revisions: z.array(RevisionSummarySchema),
});

export type ProcedureScope = z.infer<typeof ProcedureScopeSchema>;
export type RevisionKey = z.infer<typeof RevisionKeySchema>;
export type RevisionSummary = z.infer<typeof RevisionSummarySchema>;
export type RevisionHistoryResponse = z.infer<typeof RevisionHistoryResponseSchema>;
