import type { AnalysisResponse, RevisionKey, RevisionSummary } from "@runtime-visualizer/contracts";
import type { WorkspaceController } from "../../useCases/liveWorkspace.ports";
import type { LiveWorkspaceState } from "../../useCases/liveWorkspace.types";
import { GraphPane } from "../controlFlowGraph/GraphPane";
import { SourcePane } from "../source/SourcePane";

type ProcedureWorkspaceProps = {
  state: LiveWorkspaceState;
  controller: WorkspaceController;
  analysis: AnalysisResponse | null;
  scope: RevisionKey | null;
  visibleExecutions: LiveWorkspaceState["executions"];
  revisionBadge: RevisionSummary | null;
};

export function ProcedureWorkspace({
  state,
  controller,
  analysis,
  scope,
  visibleExecutions,
  revisionBadge,
}: ProcedureWorkspaceProps) {
  const loading = state.pane.status === "loading";
  const failed = state.pane.status === "failed";
  return (
    <section className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-[-0.025em] text-white">
              {analysis?.procedure.label ?? "Workspace"}
            </h1>
            {analysis ? (
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[8px] text-slate-500">
                {analysis.procedure.kind}
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-[9px] text-slate-600">
            {scope
              ? `${scope.file} · ${scope.procedureId} · revision ${scope.revision}`
              : "Select a file and Procedure to begin"}
            {revisionBadge ? (
              <span className="ml-2 text-emerald-300">
                {revisionBadge.runnable
                  ? "runnable"
                  : `${revisionBadge.diagnosticCount} diagnostics`}
              </span>
            ) : null}
          </p>
        </div>
      </div>
      {analysis?.diagnostics.length ? (
        <section
          aria-label="Diagnostics"
          role="alert"
          className="mb-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.05] p-4"
        >
          <h2 className="text-xs font-semibold text-rose-200">Diagnostics</h2>
          <ul className="mt-2 space-y-1 text-[10px] text-rose-100/80">
            {analysis.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.procedure}-${diagnostic.message ?? diagnostic.reason}-${index}`}>
                {diagnostic.message ?? diagnostic.reason}
                {diagnostic.location ? (
                  <span className="ml-2 font-mono text-rose-300/70">
                    line {diagnostic.location.start.line}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="relative min-h-0 flex-1">
        {analysis && scope ? (
          <div className="grid min-h-0 gap-3 xl:grid-cols-[1.6fr_1fr]">
            {analysis.cfg ? (
              <GraphPane
                cfg={analysis.cfg}
                scope={scope}
                focus={state.focus}
                executions={visibleExecutions}
                selectedExecutionId={state.selectedExecutionId}
                importsVisible={state.importsVisible}
                onFocus={controller.focus}
                onImportsVisibleChange={controller.setImportsVisible}
              />
            ) : (
              <section
                role="alert"
                aria-label="Control-flow graph"
                className="flex min-h-[28rem] items-center justify-center rounded-xl border border-rose-300/20 bg-rose-300/[0.04] p-6 text-center text-xs text-rose-200"
              >
                Control-flow graph unavailable because this revision has diagnostics.
              </section>
            )}
            <SourcePane
              source={analysis.source}
              cfg={analysis.cfg}
              scope={scope}
              focus={state.focus}
              importsVisible={state.importsVisible}
              diagnostics={analysis.diagnostics}
              onFocus={controller.focus}
            />
          </div>
        ) : (
          <div className="flex min-h-[28rem] items-center justify-center rounded-xl border border-white/10 bg-[#091510] text-xs text-slate-500">
            {state.status === "loading" ? "Loading workspace…" : "No analysis loaded."}
          </div>
        )}
        {loading ? (
          <div
            role="status"
            className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-[#07110E]/55 pt-4 backdrop-blur-[1px]"
          >
            <span className="rounded-full border border-amber-300/20 bg-[#0A1712] px-3 py-1.5 text-[10px] text-amber-200">
              Loading selected revision…
            </span>
          </div>
        ) : null}
        {failed ? (
          <div
            role="alert"
            className="absolute inset-x-3 top-3 z-10 rounded-lg border border-rose-300/20 bg-[#0A1712]/95 px-3 py-2 text-[10px] text-rose-200"
          >
            {state.pane.status === "failed" ? state.pane.error : "Analysis unavailable."}
          </div>
        ) : null}
      </div>
    </section>
  );
}
