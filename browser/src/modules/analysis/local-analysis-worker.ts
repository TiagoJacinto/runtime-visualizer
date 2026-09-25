import type { AnalysisResponse } from "@runtime-visualizer/contracts";

import { analyseProject } from "./cfg/project-analyzer.ts";
import { projectDependencyFiles } from "./cfg/diagnostics.ts";
import { discoverProcedures } from "./source/discover-procedures.ts";
import type { AnalysisSnapshot, AnalysisWorker } from "./index.ts";

const digest = async (value: string): Promise<string> => {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("Analysis revisions require a secure browser context.");
  }
  const bytes = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const createLocalAnalysisWorker = (): AnalysisWorker => ({
  analyze: async ({ projectId, file, procedure, files, source }) => {
    const result = analyseProject({
      filePath: file,
      files,
      functionName: procedure.name ?? undefined,
      source,
    });
    const dependencies = projectDependencyFiles({
      filePath: file,
      files,
      source,
    });
    const revision = await digest(
      JSON.stringify(
        dependencies.map((path) => [path, path === file ? source : files[path]])
      )
    );
    // SAFETY: the CFG module emits the same JSON shape as the public response schema.
    return {
      analyzedAt: new Date().toISOString(),
      // SAFETY: analyseProject returns the matching public CFG structure.
      cfg: (result.cfg ?? null) as AnalysisResponse["cfg"],
      diagnostics: result.diagnostics,
      file,
      files,
      procedure,
      procedureId: procedure.id,
      procedures: discoverProcedures(source, file),
      projectId,
      revision,
      source,
    } satisfies AnalysisSnapshot;
  },
});
