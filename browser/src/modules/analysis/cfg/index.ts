export { diagnoseProject, projectDependencyFiles, analysisCompilerOptions } from "./diagnostics.ts";
export { analyseFileProcedure } from "./file-analyzer.ts";
export { analyseProject } from "./project-analyzer.ts";
export type {
  CfgEdge,
  CfgEdgeKind,
  CfgNode,
  CfgNodeKind,
  ControlFlowGraph,
  FunctionCfg,
  GraphDiagnostic,
  ProcedureCfg,
  SourceLocation,
} from "./types.ts";
export type { ProjectAnalysis, ProjectAnalysisRequest } from "./project-analyzer.ts";
