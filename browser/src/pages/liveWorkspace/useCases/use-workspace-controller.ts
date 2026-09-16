import { useEffect, useState } from "react";

import type { WorkspaceController } from "./live-workspace.ports";
import type { LiveWorkspaceState } from "./live-workspace.types";

export const useWorkspaceController = (
  controller: WorkspaceController,
  disposeOnUnmount = true
): LiveWorkspaceState => {
  const [state, setState] = useState(controller.getState());
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    controller.start();
    return () => {
      unsubscribe();
      if (disposeOnUnmount) {
        controller.dispose();
      }
    };
  }, [controller, disposeOnUnmount]);
  return state;
};
