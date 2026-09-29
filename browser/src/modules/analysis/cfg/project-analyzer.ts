import { diagnoseProject } from "./diagnostics.ts";
import type { SourceProject } from "./diagnostics.ts";
import { analyseFileProcedure } from "./file-analyzer.ts";
import type { ControlFlowGraph, GraphDiagnostic } from "./types.ts";

export interface ProjectAnalysis {
  readonly cfg?: ControlFlowGraph;
  readonly diagnostics: GraphDiagnostic[];
}
export type ProjectAnalysisRequest = SourceProject & {
  readonly showImports?: boolean;
  readonly functionName?: string;
};
/** Validate a complete uploaded program before building its selected file graph. */
export const analyseProject = async ({
  source,
  filePath,
  files,
  showImports,
  functionName,
}: ProjectAnalysisRequest): Promise<ProjectAnalysis> => {
  const diagnostics = await diagnoseProject({ filePath, files, source });
  if (diagnostics.length > 0) {
    return { diagnostics };
  }
  return {
    cfg: analyseFileProcedure(source, filePath, { functionName, showImports }),
    diagnostics,
  };
};
