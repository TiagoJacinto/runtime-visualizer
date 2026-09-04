import { useEffect, useState } from "react";
import { createAnalysisGateway } from "../../shared/api/analysisGateway";
import { createExecutionGateway } from "../../shared/api/executionGateway";
import { createWorkspaceEventsGateway } from "../../shared/api/workspaceEventsGateway";
import { createLocalStorageWorkspacePreferences } from "../../shared/api/workspacePreferences";
import { createRetryScheduler } from "../../shared/retry/retryScheduler";
import { ContextRail } from "./components/contextRail/ContextRail";
import { WorkspaceHeader } from "./components/workspaceHeader/WorkspaceHeader";
import { WorkspaceNotifications } from "./components/notifications/WorkspaceNotifications";
import { ProcedureWorkspace } from "./components/procedureWorkspace/ProcedureWorkspace";
import { createLiveWorkspaceController } from "./useCases/createLiveWorkspaceController";
import type { WorkspaceController } from "./useCases/liveWorkspace.ports";
import type { LiveWorkspaceState } from "./useCases/liveWorkspace.types";
import {
  selectRevisionBadge,
  selectVisibleExecutions,
} from "./useCases/liveWorkspace.selectors";

export function LiveWorkspacePage({
  controller: provided,
}: {
  controller?: WorkspaceController;
}) {
  const [controller] = useState(
    () =>
      provided ??
      createLiveWorkspaceController({
        analysis: createAnalysisGateway(),
        execution: createExecutionGateway(),
        workspaceEvents: createWorkspaceEventsGateway(),
        preferences: createLocalStorageWorkspacePreferences(),
        retry: createRetryScheduler(),
      }),
  );
  const [state, setState] = useState<LiveWorkspaceState>(controller.getState());
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    controller.start();
    return () => {
      unsubscribe();
      if (!provided) controller.dispose();
    };
  }, [controller, provided]);

  const analysis = state.analysis;
  const selectedScope = state.selectedScope;
  const displayedScope = analysis
    ? {
        file: analysis.file,
        procedureId: analysis.procedureId,
        revision: analysis.revision,
      }
    : selectedScope;
  const visibleExecutions = selectVisibleExecutions(state, displayedScope);
  const revisionBadge = selectRevisionBadge(state, displayedScope);
  const revisions = selectedScope
    ? (state.revisionsByScope[
        `${selectedScope.file}\0${selectedScope.procedureId}`
      ] ?? [])
    : [];

  return (
    <div
      className="h-screen w-full overflow-hidden bg-[#07110E] text-slate-100"
      data-testid="live-workspace"
    >
      <div className="flex h-full w-full flex-col">
        <WorkspaceHeader
          state={state}
          scope={displayedScope}
          onOpenRail={() => setRailOpen(true)}
        />
        <div className="relative flex min-h-0 flex-1">
          {railOpen ? (
            <button
              type="button"
              aria-label="Close workspace navigation overlay"
              onClick={() => setRailOpen(false)}
              className="absolute inset-0 z-20 bg-black/60 focus-visible:outline-2 focus-visible:outline-emerald-200 lg:hidden"
            />
          ) : null}
          <ContextRail
            state={state}
            controller={controller}
            analysis={analysis}
            selectedScope={selectedScope}
            revisions={revisions}
            revisionBadge={revisionBadge}
            open={railOpen}
            onClose={() => setRailOpen(false)}
          />
          <main className="flex min-w-0 flex-1 flex-col overflow-auto bg-[#07110E]">
            <WorkspaceNotifications state={state} controller={controller} />
            {state.status === "empty" ? (
              <p
                role="status"
                className="px-4 pt-6 text-xs text-slate-500 sm:px-6"
              >
                No supported TypeScript files found.
              </p>
            ) : null}
            <ProcedureWorkspace
              state={state}
              controller={controller}
              analysis={analysis}
              scope={displayedScope}
              visibleExecutions={visibleExecutions}
              revisionBadge={revisionBadge}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
