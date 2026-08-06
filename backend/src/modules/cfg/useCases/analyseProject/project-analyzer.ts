import { diagnoseProject, type SourceProject } from "../../diagnostics.ts";
import { analyseFileProcedure } from "../analyseFile/file-analyzer.ts";
import type { ControlFlowGraph, GraphDiagnostic } from "../../types.ts";

export type ProjectAnalysis = {
	readonly cfg?: ControlFlowGraph;
	readonly diagnostics: GraphDiagnostic[];
};

export type ProjectAnalysisRequest = SourceProject & {
	readonly showImports?: boolean;
	readonly functionName?: string;
};

/** Validate a complete uploaded program before building its selected file graph. */
export function analyseProject({
	source,
	filePath,
	files,
	showImports,
	functionName,
}: ProjectAnalysisRequest): ProjectAnalysis {
	const diagnostics = diagnoseProject({ source, filePath, files });
	if (diagnostics.length > 0) return { diagnostics };
	return {
		diagnostics,
		cfg: analyseFileProcedure(source, filePath, { showImports, functionName }),
	};
}
