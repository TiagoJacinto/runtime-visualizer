export { analysisCompilerOptions, diagnoseProject, projectDependencyFiles } from "./diagnostics.ts";
export { analyseFileProcedure } from "./useCases/analyseFile/file-analyzer.ts";
export { analyseProject } from "./useCases/analyseProject/project-analyzer.ts";

export type { SourceProject } from "./diagnostics.ts";
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
export type {
	ProjectAnalysis,
	ProjectAnalysisRequest,
} from "./useCases/analyseProject/project-analyzer.ts";
