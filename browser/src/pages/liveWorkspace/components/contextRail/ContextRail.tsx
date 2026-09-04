import { Activity, X } from "lucide-react";
import type {
  AnalysisResponse,
  RevisionKey,
  RevisionSummary,
} from "@runtime-visualizer/contracts";
import type { WorkspaceController } from "../../useCases/liveWorkspace.ports";
import type { LiveWorkspaceState } from "../../useCases/liveWorkspace.types";
import { ActiveRuns } from "./ActiveRuns";
import { ScopeNavigation } from "./ScopeNavigation";

type ContextRailProps = {
  state: LiveWorkspaceState;
  controller: WorkspaceController;
  analysis: AnalysisResponse | null;
  selectedScope: RevisionKey | null;
  revisions: readonly RevisionSummary[];
  revisionBadge: RevisionSummary | null;
  open: boolean;
  onClose: () => void;
};

export function ContextRail({
  state,
  controller,
  analysis,
  selectedScope,
  revisions,
  revisionBadge,
  open,
  onClose,
}: ContextRailProps) {
  const selectTab = (tab: "scope" | "runs") => {
    controller.dispatch({ type: "set-tab", tab });
  };
  return (
    <aside
      aria-label="Workspace context"
      className={`absolute inset-y-0 left-0 z-30 flex w-[268px] shrink-0 flex-col border-r border-white/10 bg-[#0A1712] transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 lg:hidden">
        <span className="text-xs font-semibold text-white">
          Workspace context
        </span>
        <button
          type="button"
          aria-label="Close workspace navigation"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-500 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        role="tablist"
        aria-label="Workspace context"
        className="flex shrink-0 gap-1 border-b border-white/10 p-2"
      >
        <button
          type="button"
          role="tab"
          id="workspace-scope-tab"
          aria-selected={state.contextTab === "scope"}
          aria-controls="workspace-scope-panel"
          onClick={() => selectTab("scope")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] transition focus-visible:outline-2 focus-visible:outline-emerald-200 ${state.contextTab === "scope" ? "bg-white/[0.08] text-white" : "text-slate-500 hover:text-slate-300"}`}
        >
          Scope
        </button>
        <button
          type="button"
          role="tab"
          id="workspace-runs-tab"
          aria-selected={state.contextTab === "runs"}
          aria-controls="workspace-runs-panel"
          onClick={() => selectTab("runs")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] transition focus-visible:outline-2 focus-visible:outline-emerald-200 ${state.contextTab === "runs" ? "bg-white/[0.08] text-white" : "text-slate-500 hover:text-slate-300"}`}
        >
          <Activity className="h-3 w-3 text-emerald-300" />
          Runs
          <span className="text-slate-600">
            {Object.keys(state.activeExecutionsById).length}
          </span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {state.contextTab === "scope" ? (
          <div
            id="workspace-scope-panel"
            role="tabpanel"
            aria-labelledby="workspace-scope-tab"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <ScopeNavigation
              state={state}
              analysis={analysis}
              selectedScope={selectedScope}
              revisions={revisions}
              revisionBadge={revisionBadge}
              onSelectFile={controller.selectFile}
              onSelectProcedure={controller.selectProcedure}
              onSelectRevision={controller.selectRevision}
              onRun={controller.runProcedure}
            />
          </div>
        ) : (
          <div
            id="workspace-runs-panel"
            role="tabpanel"
            aria-labelledby="workspace-runs-tab"
            className="flex min-h-0 flex-1"
          >
            <ActiveRuns
              executions={state.executions.filter(
                (execution) =>
                  state.cancellation.pendingById[execution.executionId] !== true,
              )}
              selectedExecutionId={state.selectedExecutionId}
              onSelect={controller.selectExecution}
              onClearCompleted={controller.clearCompleted}
              onCancel={(executionId) => {
                if (state.cancellation.armedExecutionId === executionId)
                  controller.confirmCancel(executionId);
                else controller.armCancel(executionId);
              }}
              armedExecutionId={state.cancellation.armedExecutionId}
              pendingCancelIds={state.cancellation.pendingById}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
