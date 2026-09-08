import { useEffect, useState } from "react";

import type { WorkspaceController } from "./live-workspace.ports";
import type { LiveWorkspaceState } from "./live-workspace.types";

export const useWorkspaceController = (
  controller: WorkspaceController
): LiveWorkspaceState => {
  const [state, setState] = useState(controller.getState());
  useEffect(() => controller.subscribe(setState), [controller]);
  return state;
};
