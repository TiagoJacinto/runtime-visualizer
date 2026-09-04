import { z } from "zod";

const SourceLocationSchema = z.object({
  start: z.object({ line: z.number(), column: z.number() }),
  end: z.object({ line: z.number(), column: z.number() }),
});

const ProcedureSchema = z.object({
  id: z.string(),
  kind: z.enum(["TopLevel", "Function"]),
  name: z.string().nullable(),
  label: z.string(),
});

const CfgNodeSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  location: SourceLocationSchema.optional(),
  text: z.string().optional(),
});

const CfgEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.string().optional(),
  label: z.string().optional(),
});

const ProcedureCfgSchema = z.object({
  name: z.string(),
  nodes: z.array(CfgNodeSchema),
  edges: z.array(CfgEdgeSchema),
  entry: z.string(),
  exit: z.string(),
});

const ControlFlowGraphSchema = z.object({
  filePath: z.string().optional(),
  functions: z.array(z.any()),
  procedures: z.array(ProcedureCfgSchema).optional(),
});

const DiagnosticSchema = z.object({
  procedure: z.string(),
  dependency: z.string().optional(),
  reason: z.string(),
  message: z.string().optional(),
  location: SourceLocationSchema.optional(),
});

export const AnalysisResponseSchema = z.object({
  file: z.string(),
  procedure: ProcedureSchema,
  procedureId: z.string().min(1),
  revision: z.string(),
  source: z.string(),
  procedures: z.array(ProcedureSchema),
  cfg: ControlFlowGraphSchema.nullable(),
  diagnostics: z.array(DiagnosticSchema),
});

export const AnalysisErrorSchema = z.object({
  error: z.string(),
  file: z.string(),
  procedureId: z.string().min(1),
  revision: z.string(),
  source: z.string(),
  procedures: z.array(ProcedureSchema),
  diagnostics: z.array(DiagnosticSchema),
});

export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;
export type AnalysisError = z.infer<typeof AnalysisErrorSchema>;
