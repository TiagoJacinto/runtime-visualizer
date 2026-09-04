import { useEffect, useState } from "react";
import { createAnalysisGateway } from "../../shared/api/analysisGateway";
import { createExecutionGateway } from "../../shared/api/executionGateway";
import { createWorkspaceEventsGateway } from "../../shared/api/workspaceEventsGateway";
import { createLocalStorageWorkspacePreferences } from "../../shared/api/workspacePreferences";
import { createRetryScheduler } from "../../shared/retry/retryScheduler";
import { createLiveWorkspaceController } from "./useCases/createLiveWorkspaceController";
import type { WorkspaceController } from "./useCases/liveWorkspace.ports";
import type { LiveWorkspaceState } from "./useCases/liveWorkspace.types";
import { GraphPane } from "./components/controlFlowGraph/GraphPane";
import { SourcePane } from "./components/source/SourcePane";
import { RunInspector } from "./components/runInspector/RunInspector";
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
  const revisionBadge = selectRevisionBadge(state, selectedScope);
  const revisions = selectedScope
    ? state.revisionsByScope[`${selectedScope.file}\0${selectedScope.procedureId}`] ?? []
    : [];
  return (
    <main
      className="min-h-screen bg-slate-950 p-6 text-slate-100"
      data-testid="live-workspace"
    >
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Runtime Visualizer</h1>
        <p className="text-sm text-slate-400">Live backend workspace</p>
      </header>
      {state.status === "loading" && <p role="status">Loading workspace…</p>}
      {state.status === "empty" && (
        <p role="status">No supported TypeScript files found.</p>
      )}
      {state.connection === "reconnecting" && (
        <p role="status" className="mb-4 text-amber-300">Reconnecting…</p>
      )}
      {state.queuedRevision !== null && (
        <p role="status" className="mb-4 text-amber-300">Update queued</p>
      )}
      {state.fileDeleted && (
        <p role="alert" className="mb-4 text-rose-300">File deleted</p>
      )}
      {state.status === "error" && (
        <div role="alert">
          <p>Backend unavailable: {state.error}</p>
          <button type="button" onClick={controller.retry}>
            Retry
          </button>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Workspace navigation" className="space-y-4">
          <label className="block text-sm">
            File
            <select
              aria-label="File"
              value={state.selectedFile ?? ""}
              disabled={state.files.length === 0 || state.connection === "reconnecting"}
              onChange={(event) => controller.selectFile(event.target.value)}
              className="mt-1 block w-full bg-slate-900 p-2"
            >
              <option value="" disabled>
                Select a file
              </option>
              {state.files.map((file) => (
                <option key={file}>{file}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Procedure
            <select
              aria-label="Procedure"
              value={state.selectedProcedure ?? ""}
              disabled={!analysis || state.connection === "reconnecting"}
              onChange={(event) =>
                controller.selectProcedure(event.target.value)
              }
              className="mt-1 block w-full bg-slate-900 p-2"
            >
              {analysis?.procedures.map((procedure) => (
                <option
                  key={procedure.id}
                  value={procedure.id}
                >
                  {procedure.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Revision
            <select
              aria-label="Revision"
              value={selectedScope?.revision ?? ""}
              disabled={revisions.length === 0 || state.connection === "reconnecting"}
              onChange={(event) => {
                if (selectedScope !== null)
                  controller.selectRevision({ ...selectedScope, revision: event.target.value });
              }}
              className="mt-1 block w-full bg-slate-900 p-2"
            >
              {revisions.map((revision) => (
                <option key={revision.revision} value={revision.revision}>
                  {revision.revision}
                </option>
              ))}
            </select>
          </label>
        </nav>
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2>{analysis?.file ?? "Workspace"}</h2>
            <span className="font-mono text-xs text-slate-400">
              revision {analysis?.revision ?? "—"}
              {revisionBadge ? (
                <span className="ml-2 text-emerald-300">
                  {revisionBadge.runnable
                    ? "runnable"
                    : `${revisionBadge.diagnosticCount} diagnostics`}
                </span>
              ) : null}
            </span>
          </div>
          <section aria-label="Diagnostics">
            {analysis?.diagnostics.length ? (
              <div
                role="alert"
                className="rounded border border-rose-500/50 p-4"
              >
                <h3>Diagnostics</h3>
                {analysis.diagnostics.map((diagnostic) => (
                  <p key={`${diagnostic.procedure}-${diagnostic.message}`}>
                    {diagnostic.message ?? diagnostic.reason}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
          {analysis && displayedScope ? (
            <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
              {analysis.cfg ? (
                <GraphPane
                  cfg={analysis.cfg}
                  scope={displayedScope}
                  focus={state.focus}
                  executions={visibleExecutions}
                  selectedExecutionId={state.selectedExecutionId}
                  importsVisible={state.importsVisible}
                  onFocus={controller.focus}
                  onImportsVisibleChange={controller.setImportsVisible}
                />
              ) : (
                <section role="alert" aria-label="Control-flow graph">
                  Control-flow graph unavailable because analysis has diagnostics.
                </section>
              )}
              <SourcePane
                source={analysis.source}
                cfg={analysis.cfg}
                scope={displayedScope}
                focus={state.focus}
                importsVisible={state.importsVisible}
                diagnostics={analysis.diagnostics}
                onFocus={controller.focus}
              />
            </div>
          ) : null}
          <button
            type="button"
            disabled={!analysis?.cfg || state.status !== "ready" || state.connection === "reconnecting" || state.fileDeleted}
            onClick={controller.runProcedure}
          >
            Run Procedure
          </button>
          <RunInspector
            executions={state.executions}
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
        </section>
      </div>
    </main>
  );
}
