import { z } from "zod";
import { FileChangeEventSchema } from "./file-events.ts";
import { RevisionSummarySchema } from "./revisions.ts";

export const ActiveExecutionSchema = z.object({
  executionId: z.string().min(1),
  displayNumber: z.number().int().positive(),
  scope: z.object({ file: z.string().min(1), procedureId: z.string().min(1), revision: z.string().min(1) }),
  startedAt: z.string().datetime(),
  status: z.literal("Running"),
  currentNodeId: z.string().nullable(),
});
export const ExecutionUpdateSchema = z.object({
  executionId: z.string().min(1),
  displayNumber: z.number().int().positive(),
  scope: ActiveExecutionSchema.shape.scope,
  status: z.enum(["Running", "Succeeded", "Failed", "Cancelled"]),
  currentNodeId: z.string().nullable(),
  error: z.string().optional(),
  failedNodeId: z.string().optional(),
});
export const WorkspaceEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("source-change"), change: FileChangeEventSchema }),
  z.object({ type: z.literal("revision-ready"), revision: RevisionSummarySchema }),
  z.object({ type: z.literal("revision-build-failed"), paths: z.array(z.string()), error: z.string() }),
  z.object({ type: z.literal("active-executions"), executions: z.array(ActiveExecutionSchema) }),
  z.object({ type: z.literal("execution-update"), update: ExecutionUpdateSchema }),
  z.object({ type: z.literal("resync-required") }),
]);
export type ActiveExecution = z.infer<typeof ActiveExecutionSchema>;
export type ExecutionUpdate = z.infer<typeof ExecutionUpdateSchema>;
export type WorkspaceEvent = z.infer<typeof WorkspaceEventSchema>;
