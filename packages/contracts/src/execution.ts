import { z } from "zod";

export const ExecutionIdSchema = z.string().min(1);

export const ExecuteProcedureRequestSchema = z.object({
  file: z.string().min(1),
  procedureId: z.string().min(1),
  revision: z.string().min(1),
});

export const ExecuteProcedureResponseSchema = z.object({
  executionId: ExecutionIdSchema,
});

export type ExecuteProcedureRequest = z.infer<typeof ExecuteProcedureRequestSchema>;
export type ExecuteProcedureResponse = z.infer<typeof ExecuteProcedureResponseSchema>;
