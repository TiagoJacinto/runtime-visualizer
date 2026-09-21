import { useCallback, useRef, useSyncExternalStore } from "react";

import type { WorkspaceController } from "./live-workspace.ports";
import type { LiveWorkspaceState } from "./live-workspace.types";

export const useWorkspaceController = (
  controller: WorkspaceController,
  disposeOnUnmount = true
): LiveWorkspaceState => {
  const pendingDispose = useRef<number | null>(null);
  const subscribe = useCallback(
    (listener: (state: LiveWorkspaceState) => void) => {
      if (pendingDispose.current !== null) {
        window.clearTimeout(pendingDispose.current);
        pendingDispose.current = null;
      }
      const unsubscribe = controller.subscribe(listener);
      controller.start();
      return () => {
        unsubscribe();
        if (disposeOnUnmount) {
          pendingDispose.current = window.setTimeout(() => {
            pendingDispose.current = null;
            controller.dispose();
          }, 0);
        }
      };
    },
    [controller, disposeOnUnmount]
  );
  return useSyncExternalStore(
    subscribe,
    controller.getState,
    controller.getState
  );
};
