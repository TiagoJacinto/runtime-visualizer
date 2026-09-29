import type {
  AnalysisSnapshot,
  ProjectRevisionKey,
  RevisionSummary,
} from "../analysis/index.ts";

export interface RevisionHistory {
  save: (snapshot: AnalysisSnapshot) => Promise<"inserted" | "existing">;
  load: (key: ProjectRevisionKey) => Promise<AnalysisSnapshot | undefined>;
  list: (
    scope: Pick<ProjectRevisionKey, "projectId" | "file" | "procedureId">
  ) => Promise<readonly RevisionSummary[]>;
}

export type {
  AnalysisSnapshot,
  ProjectRevisionKey,
} from "../analysis/index.ts";
export type { ProjectId } from "../project-files/index.ts";
export { IndexedDbRevisionHistory } from "./indexed-db-revision-history.ts";
