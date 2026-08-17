import { useEffect, useState } from "react";
import { createAnalysisGateway } from "../../shared/api/analysisGateway";
import { createLiveWorkspaceController } from "./useCases/createLiveWorkspaceController";
import type { WorkspaceController } from "./useCases/liveWorkspace.ports";
import type { LiveWorkspaceState } from "./useCases/liveWorkspace.types";
import { ControlFlowGraph } from "./components/controlFlowGraph/ControlFlowGraph";

export function LiveWorkspacePage({ controller: provided }: { controller?: WorkspaceController }) {
  const [controller] = useState(() => provided ?? createLiveWorkspaceController({ analysis: createAnalysisGateway() }));
  const [state, setState] = useState<LiveWorkspaceState>(controller.getState());
  useEffect(() => { const unsubscribe = controller.subscribe(setState); return () => { unsubscribe(); if (!provided) controller.dispose(); }; }, [controller, provided]);
  const analysis = state.analysis;
  return <main className="min-h-screen bg-slate-950 p-6 text-slate-100" data-testid="live-workspace">
    <header className="mb-6"><h1 className="text-xl font-semibold">Runtime Visualizer</h1><p className="text-sm text-slate-400">Live backend workspace</p></header>
    {state.status === "loading" && <p role="status">Loading workspace…</p>}
    {state.status === "empty" && <p role="status">No supported TypeScript files found.</p>}
    {state.status === "error" && <div role="alert"><p>Backend unavailable: {state.error}</p><button type="button" onClick={controller.retry}>Retry</button></div>}
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Workspace navigation" className="space-y-4">
        <label className="block text-sm">File<select aria-label="File" value={state.selectedFile ?? ""} disabled={state.files.length === 0} onChange={(event) => controller.selectFile(event.target.value)} className="mt-1 block w-full bg-slate-900 p-2"><option value="" disabled>Select a file</option>{state.files.map((file) => <option key={file}>{file}</option>)}</select></label>
        <label className="block text-sm">Procedure<select aria-label="Procedure" value={state.selectedProcedure ?? ""} disabled={!analysis} onChange={(event) => controller.selectProcedure(event.target.value)} className="mt-1 block w-full bg-slate-900 p-2">{analysis?.procedures.map((procedure) => <option key={procedure.id} value={procedure.name ?? procedure.label}>{procedure.label}</option>)}</select></label>
      </nav>
      <section className="space-y-6"><div className="flex items-center justify-between"><h2>{analysis?.file ?? "Workspace"}</h2><span className="font-mono text-xs text-slate-400">revision {analysis?.revision ?? "—"}</span></div>
        <section aria-label="Source"><h3 className="mb-2 font-medium">Source</h3><pre className="overflow-auto rounded bg-slate-900 p-4 text-sm">{analysis?.source ?? "Source is unavailable."}</pre></section>
        <section aria-label="Diagnostics">{analysis?.diagnostics.length ? <div role="alert" className="rounded border border-rose-500/50 p-4"><h3>Diagnostics</h3>{analysis.diagnostics.map((diagnostic) => <p key={`${diagnostic.procedure}-${diagnostic.message}`}>{diagnostic.message ?? diagnostic.reason}</p>)}</div> : null}</section>
        {analysis?.cfg ? <ControlFlowGraph cfg={analysis.cfg} /> : analysis && <section role="alert" aria-label="Control-flow graph">Control-flow graph unavailable because analysis has diagnostics.</section>}
        <button type="button" disabled={!analysis?.cfg}>Run Procedure</button>
      </section>
    </div>
  </main>;
}
