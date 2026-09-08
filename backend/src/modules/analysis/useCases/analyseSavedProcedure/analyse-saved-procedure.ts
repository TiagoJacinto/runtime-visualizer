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
  type ProcedureResource,
} from "../../../source/index.ts";
import type {
  RevisionHistory,
  AnalysisSnapshot,
} from "../../revisionHistory.ts";

export type AnalysisError = {
  readonly error: string;
  readonly file: string;
  readonly procedureId: string;
  readonly revision: string;
  readonly source: string;
  readonly procedures: readonly ProcedureResource[];
  readonly diagnostics: readonly GraphDiagnostic[];
};
export type AnalyseSavedProcedureResult =
  | { readonly ok: true; readonly snapshot: AnalysisSnapshot }
  | { readonly ok: false; readonly error: AnalysisError };
export type AnalyseSavedProcedureInput = {
  readonly file: string;
  readonly procedureId?: string;
  readonly name?: string;
  readonly revision?: string;
  readonly showImports?: boolean;
};

export async function analyseSavedProcedure(
  filesFolder: string,
  history: RevisionHistory,
  input: AnalyseSavedProcedureInput,
): Promise<AnalyseSavedProcedureResult> {
  if (input.revision !== undefined) {
    if (input.procedureId === undefined)
      return { ok: false, error: unavailableRevision(input) };
    const historical = await history.load({
      file: input.file,
      procedureId: input.procedureId,
      revision: input.revision,
    });
    if (historical) return { ok: true, snapshot: historical };
    // An explicit historical request is never allowed to fall through to current analysis.
    return { ok: false, error: unavailableRevision(input) };
  }
  const resource = await readSource(filesFolder, input.file);
  const procedures = discoverProcedures(resource.source, resource.file);
  const selectedProcedure = input.procedureId
    ? procedures.find((p) => p.id === input.procedureId)
    : findProcedure(procedures, input.name);
  const procedure = selectedProcedure ?? procedures[0];
  if (!procedure)
    return {
      ok: false,
      error: {
        error: "No executable Procedure found",
        file: resource.file,
        procedureId: input.procedureId ?? "top-level",
        revision: "",
        source: resource.source,
        procedures,
        diagnostics: [],
      },
    };
  const functionName = procedure.name ?? undefined;
  const sourceFiles = (await listSourceFiles(filesFolder)).filter(isSourceFile);
  const entries: Array<readonly [string, string]> = [];
  const workerCount = Math.min(8, sourceFiles.length);
  const workers: Promise<void>[] = [];
  for (let worker = 0; worker < workerCount; worker += 1) {
    workers.push(
      (async () => {
        for (
          let index = worker;
          index < sourceFiles.length;
          index += workerCount
        ) {
          const file = sourceFiles[index];
          if (file)
            entries.push([file, (await readSource(filesFolder, file)).source]);
        }
      })(),
    );
  }
  await Promise.all(workers);
  const files = Object.fromEntries(entries);
  const revision = workspaceManifestRevision({
    source: resource.source,
    file: resource.file,
    files,
    showImports: input.showImports,
  });
  const analysis = analyseProject({
    source: resource.source,
    filePath: resource.file,
    functionName,
    files,
    showImports: input.showImports,
  });
  const snapshot: AnalysisSnapshot = {
    file: resource.file,
    procedure,
    revision,
    source: resource.source,
    files,
    procedures,
    cfg: analysis.cfg ?? null,
    diagnostics: analysis.diagnostics,
    analyzedAt: new Date().toISOString(),
  };
  await history.save(snapshot);
  if (analysis.diagnostics.length > 0)
    return {
      ok: false,
      error: {
        error: "Analysis failed",
        file: resource.file,
        procedureId: procedure.id,
        revision,
        source: resource.source,
        procedures,
        diagnostics: analysis.diagnostics,
      },
    };
  if (analysis.cfg === null)
    return {
      ok: false,
      error: {
        error: "No executable Procedure found",
        file: resource.file,
        procedureId: procedure.id,
        revision,
        source: resource.source,
        procedures,
        diagnostics: [],
      },
    };
  return { ok: true, snapshot };
}
function unavailableRevision(input: AnalyseSavedProcedureInput): AnalysisError {
  return {
    error: "Revision unavailable",
    file: input.file,
    procedureId: input.procedureId ?? "",
    revision: input.revision ?? "",
    source: "",
    procedures: [],
    diagnostics: [],
  };
}
function findProcedure(
  procedures: readonly ProcedureResource[],
  name: string | undefined,
): ProcedureResource | undefined {
  return name === undefined
    ? procedures[0]
    : procedures.find((p) => p.name === name);
}
function workspaceManifestRevision({
  source,
  file,
  files,
  showImports = false,
}: {
  readonly source: string;
  readonly file: string;
  readonly files: Readonly<Record<string, string>>;
  readonly showImports?: boolean;
}): string {
  const dependencyFiles = projectDependencyFiles({
    source,
    filePath: file,
    files,
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
      }),
    )
    .digest("hex");
}
