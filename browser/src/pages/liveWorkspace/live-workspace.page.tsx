import { useEffect, useMemo, useState } from "react";

import { AnalysisGateway } from "../../shared/api/analysis-gateway";
import { ExecutionGateway } from "../../shared/api/execution-gateway";
import { WorkspaceEventsGateway } from "../../shared/api/workspace-events-gateway";
import { LocalStorageWorkspacePreferences } from "../../shared/api/workspace-preferences";
import { RetryScheduler } from "../../shared/retry/retry-scheduler";
import { ContextRail } from "./components/contextRail/context-rail";
import { WorkspaceNotifications } from "./components/notifications/workspace-notifications";
import { ProcedureWorkspace } from "./components/procedureWorkspace/procedure-workspace";
import { WorkspaceHeader } from "./components/workspaceHeader/workspace-header";
import { LiveWorkspaceController } from "./useCases/live-workspace.controller";
import type { WorkspaceController } from "./useCases/live-workspace.ports";
import {
  selectRevisionBadge,
  selectVisibleExecutions,
} from "./useCases/live-workspace.selectors";
import type { LiveWorkspaceState } from "./useCases/live-workspace.types";

export const LiveWorkspacePage = ({
  controller: provided,
}: {
  controller?: WorkspaceController;
}) => {
  const controller = useMemo(
    () =>
      provided ??
      new LiveWorkspaceController({
        analysis: new AnalysisGateway(),
        execution: new ExecutionGateway(),
        preferences: new LocalStorageWorkspacePreferences(),
        retry: new RetryScheduler(),
        workspaceEvents: new WorkspaceEventsGateway(),
      }),
    [provided]
  );
  const [state, setState] = useState<LiveWorkspaceState>(controller.getState());
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    controller.start();
    return () => {
      unsubscribe();
      if (!provided) {
        controller.dispose();
      }
    };
  }, [controller, provided]);
  const { analysis } = state;
  const { selectedScope } = state;
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
              <output className="px-4 pt-6 text-xs text-slate-500 sm:px-6">
                No supported TypeScript files found.
              </output>
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
};
