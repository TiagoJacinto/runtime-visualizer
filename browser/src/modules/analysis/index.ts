import type { AnalysisResponse, RevisionSummary } from "@runtime-visualizer/contracts";

import { projectDependencyFiles } from "./cfg/diagnostics.ts";
import { discoverProcedures } from "./source/discover-procedures.ts";
import type { ProcedureResource } from "./source/types.ts";
import type {
  ProjectFileChange,
  ProjectFiles,
  ProjectId,
  SourceMap,
} from "../project-files/index.ts";
import type { RevisionHistory } from "../revision-history/index.ts";

export { analyseFileProcedure } from "./cfg/file-analyzer.ts";
export { analyseProject } from "./cfg/project-analyzer.ts";
export { diagnoseProject, projectDependencyFiles } from "./cfg/diagnostics.ts";
export { discoverProcedures } from "./source/discover-procedures.ts";
export { createLocalAnalysisWorker } from "./local-analysis-worker.ts";
export type { ControlFlowGraph, GraphDiagnostic } from "./cfg/index.ts";
export type { ProcedureResource } from "./source/types.ts";

export interface RevisionKey {
  readonly projectId: ProjectId;
  readonly file: string;
  readonly procedureId: string;
  readonly revision: string;
}

export interface AnalysisSnapshot extends AnalysisResponse {
  readonly projectId: ProjectId;
  readonly files: SourceMap;
  readonly analyzedAt: string;
}

export interface AnalysisWorker {
  analyze: (input: {
    readonly projectId: ProjectId;
    readonly file: string;
    readonly procedure: ProcedureResource;
    readonly files: SourceMap;
    readonly source: string;
  }) => Promise<AnalysisSnapshot>;
}

export interface AnalyzeProjectPort {
  listFiles: (projectId: ProjectId) => Promise<readonly string[]>;
  analyse: (
    projectId: ProjectId,
    file: string,
    procedureId?: string
  ) => Promise<AnalysisSnapshot>;
  listRevisions: (
    key: Pick<RevisionKey, "projectId" | "file" | "procedureId">
  ) => Promise<readonly RevisionSummary[]>;
  load: (key: RevisionKey) => Promise<AnalysisSnapshot | undefined>;
}

export class AnalyzeProject implements AnalyzeProjectPort {
  private readonly files: ProjectFiles;
  private readonly worker: AnalysisWorker;
  private readonly revisions: RevisionHistory;
  private readonly sourceMaps = new Map<ProjectId, SourceMap>();

  constructor(
    files: ProjectFiles,
    worker: AnalysisWorker,
    revisions: RevisionHistory
  ) {
    this.files = files;
    this.worker = worker;
    this.revisions = revisions;
  }

  listFiles(projectId: ProjectId): Promise<readonly string[]> {
    return this.files.listSourceFiles(projectId);
  }

  private async analyseFile(
    projectId: ProjectId,
    file: string,
    sourceMap: SourceMap
  ): Promise<readonly AnalysisSnapshot[]> {
    const source = sourceMap[file];
    if (source === undefined) {
      return [];
    }
    const procedures = discoverProcedures(source, file);
    const snapshots = await Promise.all(
      procedures.map((procedure) =>
        this.worker.analyze({ file, files: sourceMap, procedure, projectId, source })
      )
    );
    return Promise.all(
      snapshots.map(async (snapshot) => {
        await this.revisions.save(snapshot);
        return snapshot;
      })
    );
  }

  async analyse(
    projectId: ProjectId,
    file: string,
    procedureId?: string
  ): Promise<AnalysisSnapshot> {
    const sourceMap = await this.files.readSourceMap(projectId);
    this.sourceMaps.set(projectId, sourceMap);
    const source = sourceMap[file];
    if (source === undefined) {
      throw new Error(`Source file not found: ${file}`);
    }
    const procedures = discoverProcedures(source, file);
    const selected =
      procedures.find((procedure) => procedure.id === procedureId) ??
      procedures.at(0);
    if (selected === undefined) {
      throw new Error("No executable Procedure found");
    }
    const snapshots = await this.analyseFile(projectId, file, sourceMap);
    const selectedSnapshot = snapshots.find(
      (snapshot) => snapshot.procedure.id === selected.id
    );
    if (selectedSnapshot === undefined) {
      throw new Error("No executable Procedure found");
    }
    return selectedSnapshot;
  }

  async applySourceChanges(
    projectId: ProjectId,
    changes: readonly ProjectFileChange[]
  ): Promise<readonly AnalysisSnapshot[]> {
    const cached = this.sourceMaps.get(projectId);
    const previous = cached ?? (await this.files.readSourceMap(projectId));
    const current = new Map(Object.entries(previous));
    const changedFiles = new Set(changes.map((change) => change.file));
    for (const change of changes) {
      if (change.change === "deleted") {
        current.delete(change.file);
      } else {
        current.set(change.file, change.source);
      }
    }
    const sourceMap = Object.fromEntries(current) satisfies SourceMap;
    this.sourceMaps.set(projectId, sourceMap);

    const affected = new Set<string>();
    const candidateFiles = new Set([
      ...Object.keys(previous),
      ...Object.keys(sourceMap),
    ]);
    for (const file of candidateFiles) {
      if (sourceMap[file] === undefined) {
        continue;
      }
      if (changedFiles.has(file)) {
        affected.add(file);
        continue;
      }
      for (const candidateSourceMap of [previous, sourceMap]) {
        const source = candidateSourceMap[file];
        if (
          source !== undefined &&
          projectDependencyFiles({
            filePath: file,
            files: candidateSourceMap,
            source,
          }).some((dependency) => changedFiles.has(dependency))
        ) {
          affected.add(file);
          break;
        }
      }
    }
    const snapshots = await Promise.all(
      [...affected]
        .toSorted((a, b) => a.localeCompare(b))
        .map((file) => this.analyseFile(projectId, file, sourceMap))
    );
    return snapshots.flat();
  }

  listRevisions(
    key: Pick<RevisionKey, "projectId" | "file" | "procedureId">
  ): Promise<readonly RevisionSummary[]> {
    return this.revisions.list(key);
  }

  load(key: RevisionKey): Promise<AnalysisSnapshot | undefined> {
    return this.revisions.load(key);
  }
}
