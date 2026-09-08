import { diagnoseProject } from "../../diagnostics.ts";
import type { SourceProject } from "../../diagnostics.ts";
import type { ControlFlowGraph, GraphDiagnostic } from "../../types.ts";
import { analyseFileProcedure } from "../analyseFile/file-analyzer.ts";

export interface ProjectAnalysis {
  readonly cfg?: ControlFlowGraph;
  readonly diagnostics: GraphDiagnostic[];
}
export type ProjectAnalysisRequest = SourceProject & {
  readonly showImports?: boolean;
  readonly functionName?: string;
};
/** Validate a complete uploaded program before building its selected file graph. */
export const analyseProject = ({
  source,
  filePath,
  files,
  showImports,
  functionName,
}: ProjectAnalysisRequest): ProjectAnalysis => {
  const diagnostics = diagnoseProject({ filePath, files, source });
  if (diagnostics.length > 0) {
    return { diagnostics };
  }
  return {
    cfg: analyseFileProcedure(source, filePath, { functionName, showImports }),
    diagnostics,
  };
};
