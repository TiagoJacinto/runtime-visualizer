import type { RevisionKey } from "@runtime-visualizer/contracts";

export type WorkspaceEffect =
  | { type: "load-files" }
  | { type: "bootstrap-file"; file: string; procedureId?: string; revision?: string }
  | { type: "load-analysis"; key: RevisionKey; requestId: string }
  | { type: "load-revisions"; scope: { file: string; procedureId: string } }
  | { type: "load-active-executions" }
  | { type: "cancel-execution"; executionId: string }
  | { type: "subscribe-events"; cursor: number | null };
