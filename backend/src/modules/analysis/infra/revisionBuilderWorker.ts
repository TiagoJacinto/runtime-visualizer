import { createHash } from "node:crypto";
import { parentPort } from "node:worker_threads";
import {
  analyseProject,
  analysisCompilerOptions,
  projectDependencyFiles,
} from "../../cfg/index.ts";
import {
  discoverProcedures,
  type ProcedureResource,
} from "../../source/index.ts";
import type { AnalysisSnapshot } from "../revisionHistory.ts";

export type RevisionBuildInput = {
  file: string;
  procedure: ProcedureResource;
  source: string;
  files: Readonly<Record<string, string>>;
};

export type RevisionDependencyInput = {
  changedPaths: readonly string[];
  files: Readonly<Record<string, string>>;
};

export type RevisionBuilderWorkerRequest =
  | { type: "build"; input: RevisionBuildInput }
  | { type: "affected-files"; input: RevisionDependencyInput };

/** Resolve affected roots from one consistent workspace snapshot. */
export function resolveAffectedFiles({
  changedPaths,
  files,
}: RevisionDependencyInput): readonly string[] {
  const names = Object.keys(files).sort((left, right) =>
    left.localeCompare(right),
  );
  const changed = new Set(changedPaths);

  // A baseline includes every current source file. If a dependency was deleted,
  // it is no longer in the TypeScript Program, so conservatively rebuild every
  // current root rather than risk leaving an importer stale.
  if (changed.size === 0 || [...changed].some((path) => !(path in files))) {
    return names;
  }

  return names.filter((file) => {
    const dependencies = projectDependencyFiles({
      source: files[file] ?? "",
      filePath: file,
      files,
    });
    return [...changed].some(
      (path) => path === file || dependencies.includes(path),
    );
  });
}

/** Analysis function kept serializable so it can run in worker_threads. */
export async function buildRevisionInWorker(
  input: RevisionBuildInput,
): Promise<AnalysisSnapshot> {
  const analysis = analyseProject({
    source: input.source,
    filePath: input.file,
    functionName: input.procedure.name ?? undefined,
    files: input.files,
  });
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        compilerOptions: analysisCompilerOptions,
        files: projectDependencyFiles({
          source: input.source,
          filePath: input.file,
          files: input.files,
        }).map((name) => [
          name,
          name === input.file ? input.source : input.files[name],
        ]),
      }),
    )
    .digest("hex");
  return {
    file: input.file,
    procedure: input.procedure,
    revision,
    source: input.source,
    files: input.files,
    procedures: discoverProcedures(input.source, input.file),
    cfg: analysis.cfg ?? null,
    diagnostics: analysis.diagnostics,
    analyzedAt: new Date().toISOString(),
  };
}

const worker = parentPort;
if (worker !== null) {
  worker.on("message", async (request: RevisionBuilderWorkerRequest) => {
    try {
      if (request.type === "affected-files") {
        worker.postMessage({
          ok: true,
          affectedFiles: resolveAffectedFiles(request.input),
        });
        return;
      }
      worker.postMessage({
        ok: true,
        snapshot: await buildRevisionInWorker(request.input),
      });
    } catch (error) {
      worker.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
