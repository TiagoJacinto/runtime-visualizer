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

export const ExecutionNodeEventSchema = z.object({
  event: z.literal("node"),
  data: z.object({ nodeId: z.string() }),
});

export const ExecutionResultEventSchema = z.object({
  event: z.literal("result"),
  data: z.object({
    status: z.enum(["Succeeded", "Failed"]),
    error: z.string().optional(),
  }),
});

export const ExecutionEventSchema = z.discriminatedUnion("event", [
  ExecutionNodeEventSchema,
  ExecutionResultEventSchema,
]);

export type ExecutionNodeEvent = z.infer<typeof ExecutionNodeEventSchema>;
export type ExecutionResultEvent = z.infer<typeof ExecutionResultEventSchema>;
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;
