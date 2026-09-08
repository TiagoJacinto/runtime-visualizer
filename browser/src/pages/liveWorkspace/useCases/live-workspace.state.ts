import type { LiveWorkspaceState } from "./live-workspace.types";

export const publish = (
  listeners: Set<(state: LiveWorkspaceState) => void>,
  state: LiveWorkspaceState
) => {
  for (const listener of listeners) {
    listener(state);
  }
};
