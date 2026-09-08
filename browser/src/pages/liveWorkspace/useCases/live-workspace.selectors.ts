import type {
  RevisionKey,
  RevisionSummary,
} from "@runtime-visualizer/contracts";

import type {
  ExecutionRecord,
  LiveWorkspaceState,
} from "./live-workspace.types";

export const selectVisibleExecutions = (
  state: LiveWorkspaceState,
  scope: RevisionKey | null = state.selectedScope
): readonly ExecutionRecord[] => {
  if (scope === null) {
    return [];
  }
  return state.executions.filter(
    (execution) =>
      execution.scope.file === scope.file &&
      execution.scope.procedureId === scope.procedureId &&
      execution.scope.revision === scope.revision
  );
};
export const selectVisibleMarkers = (
  state: LiveWorkspaceState,
  nodeId: string,
  scope: RevisionKey | null = state.selectedScope
): readonly ExecutionRecord[] =>
  selectVisibleExecutions(state, scope).filter(
    (execution) => execution.currentNodeId === nodeId
  );
export const selectRevisionBadge = (
  state: LiveWorkspaceState,
  scope: RevisionKey | null = state.selectedScope
): RevisionSummary | null => {
  if (scope === null) {
    return null;
  }
  return (
    state.revisionsByScope[`${scope.file}\0${scope.procedureId}`]?.find(
      (revision) => revision.revision === scope.revision
    ) ?? null
  );
};
