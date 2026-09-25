import type { AnalysisResponse, RevisionSummary } from "@runtime-visualizer/contracts";

import { discoverProcedures } from "./source/discover-procedures.ts";
import type { ProcedureResource } from "./source/types.ts";
import type { ProjectFiles, ProjectId, SourceMap } from "../project-files/index.ts";
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

  async analyse(
    projectId: ProjectId,
    file: string,
    procedureId?: string
  ): Promise<AnalysisSnapshot> {
    const sourceMap = await this.files.readSourceMap(projectId);
    const source = sourceMap[file];
    if (source === undefined) {
      throw new Error(`Source file not found: ${file}`);
    }
    const procedures = discoverProcedures(source, file);
    const selected = procedures.find((procedure) => procedure.id === procedureId) ?? procedures.at(0);
    if (selected === undefined) {
      throw new Error("No executable Procedure found");
    }
    const snapshots = await Promise.all(
      procedures.map((procedure) =>
        this.worker.analyze({ file, files: sourceMap, procedure, projectId, source })
      )
    );
    const savedSnapshots = await Promise.all(
      snapshots.map(async (snapshot) => {
        await this.revisions.save(snapshot);
        return snapshot;
      })
    );
    const selectedSnapshot = savedSnapshots.find(
      (snapshot) => snapshot.procedure.id === selected.id
    );
    if (selectedSnapshot === undefined) {
      throw new Error("No executable Procedure found");
    }
    return selectedSnapshot;
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
