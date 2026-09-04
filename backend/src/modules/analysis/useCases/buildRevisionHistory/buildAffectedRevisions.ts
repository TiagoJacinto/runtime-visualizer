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
import type {
  RevisionHistory,
  AnalysisSnapshot,
} from "../../revisionHistory.ts";
import type { ProcedureResource } from "../../../source/index.ts";
import type { RevisionBuilderWorkerClient } from "../../infra/revisionBuilderWorkerClient.ts";

export type RevisionBuildResult = {
  readonly snapshots: readonly AnalysisSnapshot[];
  readonly affectedFiles: readonly string[];
};
export type RevisionBuilder = (input: {
  file: string;
  procedure: ProcedureResource;
  source: string;
  files: Readonly<Record<string, string>>;
}) => Promise<AnalysisSnapshot>;

const defaultBuilder: RevisionBuilder = async ({
  file,
  procedure,
  source,
  files,
}) => {
  const analysis = analyseProject({
    source,
    filePath: file,
    functionName: procedure.name ?? undefined,
    files,
  });
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        compilerOptions: analysisCompilerOptions,
        files: projectDependencyFiles({ source, filePath: file, files }).map(
          (name) => [name, name === file ? source : files[name]],
        ),
      }),
    )
    .digest("hex");
  return {
    file,
    procedure,
    revision,
    source,
    files,
    procedures: discoverProcedures(source, file),
    cfg: analysis.cfg ?? null,
    diagnostics: analysis.diagnostics,
    analyzedAt: new Date().toISOString(),
  };
};

/** Builds all Procedures affected by a batch using one consistent workspace read. */
export async function buildAffectedRevisions(
  filesFolder: string,
  changedPaths: readonly string[],
  history: RevisionHistory,
  builder: RevisionBuilder = defaultBuilder,
  onReady?: (snapshot: AnalysisSnapshot) => void,
  workerClient?: RevisionBuilderWorkerClient,
): Promise<RevisionBuildResult> {
  const names = (await listSourceFiles(filesFolder)).filter(isSourceFile);
  const readFile = async (name: string): Promise<readonly [string, string]> => {
    const resource = await readSource(filesFolder, name);
    return [name, resource.source];
  };
  const entries = await Promise.all(names.map(readFile));
  const files: Record<string, string> = Object.fromEntries(entries);
  const roots = workerClient
    ? await workerClient.resolveAffectedFiles({ changedPaths, files })
    : resolveAffectedFilesInProcess(names, changedPaths, files);
  const snapshots: AnalysisSnapshot[] = [];
  for (const file of roots) {
    const source = files[file];
    if (source === undefined) continue;
    for (const procedure of discoverProcedures(source, file)) {
      const snapshot = await (workerClient
        ? workerClient.build({ file, procedure, source, files })
        : builder({ file, procedure, source, files }));
      const result = await history.save(snapshot);
      if (result === "inserted") onReady?.(snapshot);
      snapshots.push(snapshot);
    }
  }
  return { snapshots, affectedFiles: roots };
}

function resolveAffectedFilesInProcess(
  names: readonly string[],
  changedPaths: readonly string[],
  files: Readonly<Record<string, string>>,
): readonly string[] {
  const changed = new Set(changedPaths);
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
