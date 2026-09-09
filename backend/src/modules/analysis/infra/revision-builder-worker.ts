import { createHash } from "node:crypto";
import { parentPort } from "node:worker_threads";

import {
  analyseProject,
  analysisCompilerOptions,
  projectDependencyFiles,
} from "../../cfg/index.ts";
import { discoverProcedures } from "../../source/client.ts";
import type { ProcedureResource } from "../../source/client.ts";
import type { AnalysisSnapshot } from "../revision-history.ts";

// Node worker_threads postMessage has no browser targetOrigin argument.
// oxlint-disable unicorn/require-post-message-target-origin

export interface RevisionBuildInput {
  file: string;
  procedure: ProcedureResource;
  source: string;
  files: Readonly<Record<string, string>>;
}
export interface RevisionDependencyInput {
  changedPaths: readonly string[];
  files: Readonly<Record<string, string>>;
}
export type RevisionBuilderWorkerRequest =
  | {
      type: "build";
      input: RevisionBuildInput;
    }
  | {
      type: "affected-files";
      input: RevisionDependencyInput;
    };
/** Resolve affected roots from one consistent workspace snapshot. */
export const resolveAffectedFiles = ({
  changedPaths,
  files,
}: RevisionDependencyInput): readonly string[] => {
  const names = Object.keys(files).toSorted((left, right) =>
    left.localeCompare(right)
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
      filePath: file,
      files,
      source: files[file] ?? "",
    });
    return [...changed].some(
      (path) => path === file || dependencies.includes(path)
    );
  });
};
/** Analysis function kept serializable so it can run in worker_threads. */
export const buildRevisionInWorker = (
  input: RevisionBuildInput
): Promise<AnalysisSnapshot> => {
  const analysis = analyseProject({
    filePath: input.file,
    files: input.files,
    functionName: input.procedure.name ?? undefined,
    source: input.source,
  });
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        compilerOptions: analysisCompilerOptions,
        files: projectDependencyFiles({
          filePath: input.file,
          files: input.files,
          source: input.source,
        }).map((name) => [
          name,
          name === input.file ? input.source : input.files[name],
        ]),
      })
    )
    .digest("hex");
  return Promise.resolve({
    analyzedAt: new Date().toISOString(),
    cfg: analysis.cfg ?? null,
    diagnostics: analysis.diagnostics,
    file: input.file,
    files: input.files,
    procedure: input.procedure,
    procedures: discoverProcedures(input.source, input.file),
    revision,
    source: input.source,
  });
};
const worker = parentPort;
if (worker !== null) {
  worker.on("message", async (request: RevisionBuilderWorkerRequest) => {
    try {
      if (request.type === "affected-files") {
        // SAFETY: Node's worker_threads postMessage has no browser targetOrigin.
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        worker.postMessage({
          affectedFiles: resolveAffectedFiles(request.input),
          ok: true,
        });
        return;
      }
      // SAFETY: Node's worker_threads postMessage has no browser targetOrigin.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      worker.postMessage({
        ok: true,
        snapshot: await buildRevisionInWorker(request.input),
      });
    } catch (error) {
      // SAFETY: Node's worker_threads postMessage has no browser targetOrigin.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      worker.postMessage({
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      });
    }
  });
}
