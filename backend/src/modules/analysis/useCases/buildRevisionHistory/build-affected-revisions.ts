import { createHash } from "node:crypto";

import {
  analyseProject,
  analysisCompilerOptions,
  projectDependencyFiles,
} from "../../../cfg/index.ts";
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
import type { RevisionBuilderWorkerClient } from "../../worker.ts";

export interface RevisionBuildResult {
  readonly snapshots: readonly AnalysisSnapshot[];
  readonly affectedFiles: readonly string[];
}
export type RevisionBuilder = (input: {
  file: string;
  procedure: ProcedureResource;
  source: string;
  files: Readonly<Record<string, string>>;
}) => Promise<AnalysisSnapshot>;
const defaultBuilder: RevisionBuilder = ({
  file,
  procedure,
  source,
  files,
}) => {
  const analysis = analyseProject({
    filePath: file,
    files,
    functionName: procedure.name ?? undefined,
    source,
  });
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        compilerOptions: analysisCompilerOptions,
        files: projectDependencyFiles({ filePath: file, files, source }).map(
          (name) => [name, name === file ? source : files[name]]
        ),
      })
    )
    .digest("hex");
  return Promise.resolve({
    analyzedAt: new Date().toISOString(),
    cfg: analysis.cfg ?? null,
    diagnostics: analysis.diagnostics,
    file,
    files,
    procedure,
    procedures: discoverProcedures(source, file),
    revision,
    source,
  });
};
const resolveAffectedFilesInProcess = (
  names: readonly string[],
  changedPaths: readonly string[],
  files: Readonly<Record<string, string>>
): readonly string[] => {
  const changed = new Set(changedPaths);
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
/** Builds all Procedures affected by a batch using one consistent workspace read. */
export const buildAffectedRevisions = async (
  filesFolder: string,
  changedPaths: readonly string[],
  history: RevisionHistory,
  builder: RevisionBuilder = defaultBuilder,
  onReady?: (snapshot: AnalysisSnapshot) => void,
  workerClient?: RevisionBuilderWorkerClient
): Promise<RevisionBuildResult> => {
  const listedFiles = await listSourceFiles(filesFolder);
  const names = listedFiles.filter(isSourceFile);
  const readFile = async (name: string): Promise<readonly [string, string]> => {
    const resource = await readSource(filesFolder, name);
    return [name, resource.source];
  };
  const entries = await Promise.all(names.map(readFile));
  const files: Record<string, string> = Object.fromEntries(entries);
  const roots = workerClient
    ? await workerClient.resolveAffectedFiles({ changedPaths, files })
    : resolveAffectedFilesInProcess(names, changedPaths, files);
  const buildTasks = roots.flatMap((file) => {
    const source = files[file];
    if (source === undefined) {
      return [];
    }
    return discoverProcedures(source, file).map(async (procedure) => {
      const snapshot = await (workerClient
        ? workerClient.build({ file, files, procedure, source })
        : builder({ file, files, procedure, source }));
      const result = await history.save(snapshot);
      if (result === "inserted") {
        onReady?.(snapshot);
      }
      return snapshot;
    });
  });
  const snapshots = await Promise.all(buildTasks);
  return { affectedFiles: roots, snapshots };
};
