import type { LiveWorkspaceState } from "./liveWorkspace.types";
export const publish = (listeners: Set<(state: LiveWorkspaceState) => void>, state: LiveWorkspaceState) => { for (const listener of listeners) listener(state); };
