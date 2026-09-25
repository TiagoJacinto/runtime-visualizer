import type { AnalysisSnapshot, RevisionKey } from "../analysis/index.ts";
import type { RevisionSummary } from "@runtime-visualizer/contracts";

export interface RevisionHistory {
  save: (snapshot: AnalysisSnapshot) => Promise<"inserted" | "existing">;
  load: (key: RevisionKey) => Promise<AnalysisSnapshot | undefined>;
  list: (scope: Pick<RevisionKey, "projectId" | "file" | "procedureId">) => Promise<readonly RevisionSummary[]>;
}

export type { AnalysisSnapshot, RevisionKey } from "../analysis/index.ts";
export type { ProjectId } from "../project-files/index.ts";
export { IndexedDbRevisionHistory } from "./indexed-db-revision-history.ts";
