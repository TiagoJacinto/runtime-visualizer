import { useEffect, useState } from "react";
import type { WorkspaceController } from "./liveWorkspace.ports";
import type { LiveWorkspaceState } from "./liveWorkspace.types";
export function useWorkspaceController(controller: WorkspaceController): LiveWorkspaceState {
  const [state, setState] = useState(controller.getState());
  useEffect(() => controller.subscribe(setState), [controller]);
  return state;
}
