import type { ProjectId } from "../project-files/index.ts";
import type {
  AnalysisResponse,
  AnalyzeProject,
  BrowserAnalysisPort,
  RevisionKey,
  RevisionSummary,
} from "./index.ts";

export class BrowserAnalysisGateway implements BrowserAnalysisPort {
  private readonly analysis: Pick<
    AnalyzeProject,
    "listFiles" | "analyse" | "listRevisions" | "load"
  >;
  private readonly projectId: ProjectId;

  constructor(
    analysis: Pick<
      AnalyzeProject,
      "listFiles" | "analyse" | "listRevisions" | "load"
    >,
    projectId: ProjectId
  ) {
    this.analysis = analysis;
    this.projectId = projectId;
  }

  listFiles(): Promise<readonly string[]> {
    return this.analysis.listFiles(this.projectId);
  }

  analyse(file: string, procedureId?: string): Promise<AnalysisResponse> {
    return this.analysis.analyse(this.projectId, file, procedureId);
  }

  listRevisions(
    scope: Pick<RevisionKey, "file" | "procedureId">
  ): Promise<readonly RevisionSummary[]> {
    return this.analysis.listRevisions({ ...scope, projectId: this.projectId });
  }

  async load(key: RevisionKey): Promise<AnalysisResponse> {
    const snapshot = await this.analysis.load({
      ...key,
      projectId: this.projectId,
    });
    if (snapshot === undefined) {
      throw new Error("Revision unavailable");
    }
    return snapshot;
  }
}
