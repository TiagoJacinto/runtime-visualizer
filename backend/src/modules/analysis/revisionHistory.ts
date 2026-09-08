import type { ControlFlowGraph, GraphDiagnostic } from "../cfg/index.ts";
import type { ProcedureResource } from "../source/index.ts";
import type { ProcedureScope, RevisionKey, RevisionSummary } from "../../../../packages/contracts/src/index.ts";

export type AnalysisSnapshot = {
  readonly file: string;
  readonly procedure: ProcedureResource;
  readonly revision: string;
  readonly source: string;
  readonly files: Readonly<Record<string, string>>;
  readonly procedures: readonly ProcedureResource[];
  readonly cfg: ControlFlowGraph | null;
  readonly diagnostics: readonly GraphDiagnostic[];
  readonly analyzedAt: string;
};

export type RevisionLease = {
  readonly snapshot: AnalysisSnapshot;
  readonly release: () => void;
};

export interface RevisionHistory {
  list(scope: ProcedureScope): Promise<readonly RevisionSummary[]>;
  load(key: RevisionKey): Promise<AnalysisSnapshot | undefined>;
  acquire(key: RevisionKey): Promise<RevisionLease | undefined>;
  save(snapshot: AnalysisSnapshot): Promise<"inserted" | "existing">;
  close?(): void;
}
