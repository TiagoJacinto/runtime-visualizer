import type { RevisionKey, WorkspaceEvent } from "@runtime-visualizer/contracts";

import type {
  AnalysisGatewayPort,
} from "../../../shared/api/analysis-gateway";
import type {
  LocalExecutionCommands,
  LocalExecutionUpdates,
} from "../../../modules/execution/index.ts";
import type { WorkspaceEventsGatewayPort } from "../../../shared/api/workspace-events-gateway";
import type { WorkspacePreferences } from "../../../shared/api/workspace-preferences";
import type { RetryScheduler } from "../../../shared/retry/retry-scheduler";
import type { LiveWorkspaceQueries } from "./live-workspace.query";
import type { LiveWorkspaceEvent } from "./live-workspace.reducer";
import type { LiveWorkspaceState } from "./live-workspace.types";

export type ExecutionPort = LocalExecutionCommands;

export type LocalWorkspaceChange =
  | { readonly kind: "ready" }
  | { readonly event: WorkspaceEvent; readonly kind: "event" };

export interface LocalWorkspaceChangesPort {
  watch: (signal: AbortSignal) => AsyncIterable<LocalWorkspaceChange>;
}

export type LocalWorkspaceExecutionUpdatesPort = LocalExecutionUpdates;

export interface WorkspaceController {
  readonly queries: LiveWorkspaceQueries;
  getState: () => LiveWorkspaceState;
  dispatch: (intent: LiveWorkspaceEvent) => void;
  start: () => void;
  subscribe: (listener: (state: LiveWorkspaceState) => void) => () => void;
  selectFile: (file: string) => void;
  selectProcedure: (procedureId: string) => void;
  selectRevision: (key: RevisionKey | null) => void;
  setImportsVisible: (visible: boolean) => void;
  focus: (target: LiveWorkspaceState["focus"]) => void;
  runProcedure: () => void;
  selectExecution: (executionId: string) => void;
  armCancel: (executionId: string) => void;
  confirmCancel: (executionId: string) => void;
  clearCompleted: () => void;
  retry: () => void;
  dispose: () => void;
}

export interface LiveWorkspacePorts {
  readonly dispose?: () => void;
  readonly localChanges?: LocalWorkspaceChangesPort;
  readonly localExecutionUpdates?: LocalWorkspaceExecutionUpdatesPort;
  readonly projectId?: string;
  analysis: AnalysisGatewayPort;
  execution: ExecutionPort;
  workspaceEvents?: WorkspaceEventsGatewayPort;
  preferences?: WorkspacePreferences;
  retry?: RetryScheduler;
  queries?: LiveWorkspaceQueries;
}
