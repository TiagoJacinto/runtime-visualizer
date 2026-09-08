import { createHash } from "node:crypto";

import {
  analysisCompilerOptions,
  analyseProject,
  projectDependencyFiles,
} from "../../../cfg/index.ts";
import type { GraphDiagnostic } from "../../../cfg/index.ts";
import {
  discoverProcedures,
  isSourceFile,
  listSourceFiles,
  readSource,
} from "../../../source/index.ts";
import type { ProcedureResource } from "../../../source/index.ts";
import type {
  RevisionHistory,
  AnalysisSnapshot,
} from "../../revision-history.ts";

export interface AnalysisError {
  readonly error: string;
  readonly file: string;
  readonly procedureId: string;
  readonly revision: string;
  readonly source: string;
  readonly procedures: readonly ProcedureResource[];
  readonly diagnostics: readonly GraphDiagnostic[];
}
export type AnalyseSavedProcedureResult =
  | {
      readonly ok: true;
      readonly snapshot: AnalysisSnapshot;
    }
  | {
      readonly ok: false;
      readonly error: AnalysisError;
    };
export interface AnalyseSavedProcedureInput {
  readonly file: string;
  readonly procedureId?: string;
  readonly name?: string;
  readonly revision?: string;
  readonly showImports?: boolean;
}
const unavailableRevision = (
  input: AnalyseSavedProcedureInput
): AnalysisError => ({
  diagnostics: [],
  error: "Revision unavailable",
  file: input.file,
  procedureId: input.procedureId ?? "",
  procedures: [],
  revision: input.revision ?? "",
  source: "",
});
const findProcedure = (
  procedures: readonly ProcedureResource[],
  name: string | undefined
): ProcedureResource | undefined =>
  name === undefined
    ? procedures[0]
    : procedures.find((procedure) => procedure.name === name);
const workspaceManifestRevision = ({
  source,
  file,
  files,
  showImports = false,
}: {
  readonly source: string;
  readonly file: string;
  readonly files: Readonly<Record<string, string>>;
  readonly showImports?: boolean;
}): string => {
  const dependencyFiles = projectDependencyFiles({
    filePath: file,
    files,
    source,
  });
  return createHash("sha256")
    .update(
      JSON.stringify({
        compilerOptions: analysisCompilerOptions,
        files: dependencyFiles.map((path) => [
          path,
          path === file ? source : files[path],
        ]),
        showImports,
      })
    )
    .digest("hex");
};
export const analyseSavedProcedure = async (
  filesFolder: string,
  history: RevisionHistory,
  input: AnalyseSavedProcedureInput
): Promise<AnalyseSavedProcedureResult> => {
  if (input.revision !== undefined) {
    if (input.procedureId === undefined) {
      return { error: unavailableRevision(input), ok: false };
    }
    const historical = await history.load({
      file: input.file,
      procedureId: input.procedureId,
      revision: input.revision,
    });
    if (historical) {
      return { ok: true, snapshot: historical };
    }
    // An explicit historical request is never allowed to fall through to current analysis.
    return { error: unavailableRevision(input), ok: false };
  }
  const resource = await readSource(filesFolder, input.file);
  const procedures = discoverProcedures(resource.source, resource.file);
  const selectedProcedure = input.procedureId
    ? procedures.find((p) => p.id === input.procedureId)
    : findProcedure(procedures, input.name);
  const procedure = selectedProcedure ?? procedures[0];
  if (!procedure) {
    return {
      error: {
        diagnostics: [],
        error: "No executable Procedure found",
        file: resource.file,
        procedureId: input.procedureId ?? "top-level",
        procedures,
        revision: "",
        source: resource.source,
      },
      ok: false,
    };
  }
  const functionName = procedure.name ?? undefined;
  const listedFiles = await listSourceFiles(filesFolder);
  const sourceFiles = listedFiles.filter(isSourceFile);
  const workerCount = Math.min(8, sourceFiles.length);
  const workerFiles = Array.from({ length: workerCount }, (_, worker) =>
    sourceFiles.filter((_sourceFile, index) => index % workerCount === worker)
  );
  const readEntry = async (
    file: string
  ): Promise<readonly [string, string]> => {
    const sourceResource = await readSource(filesFolder, file);
    return [file, sourceResource.source];
  };
  const groupedEntries = await Promise.all(
    workerFiles.map((filesInWorker) =>
      Promise.all(filesInWorker.map(readEntry))
    )
  );
  const entries = groupedEntries.flat();
  const files = Object.fromEntries(entries);
  const revision = workspaceManifestRevision({
    file: resource.file,
    files,
    showImports: input.showImports,
    source: resource.source,
  });
  const analysis = analyseProject({
    filePath: resource.file,
    files,
    functionName,
    showImports: input.showImports,
    source: resource.source,
  });
  const snapshot: AnalysisSnapshot = {
    analyzedAt: new Date().toISOString(),
    cfg: analysis.cfg ?? null,
    diagnostics: analysis.diagnostics,
    file: resource.file,
    files,
    procedure,
    procedures,
    revision,
    source: resource.source,
  };
  await history.save(snapshot);
  if (analysis.diagnostics.length > 0) {
    return {
      error: {
        diagnostics: analysis.diagnostics,
        error: "Analysis failed",
        file: resource.file,
        procedureId: procedure.id,
        procedures,
        revision,
        source: resource.source,
      },
      ok: false,
    };
  }
  if (analysis.cfg === null) {
    return {
      error: {
        diagnostics: [],
        error: "No executable Procedure found",
        file: resource.file,
        procedureId: procedure.id,
        procedures,
        revision,
        source: resource.source,
      },
      ok: false,
    };
  }
  return { ok: true, snapshot };
};
