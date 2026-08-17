import type { AnalysisResponse } from "@runtime-visualizer/contracts";
export function ControlFlowGraph({ cfg }: { cfg: NonNullable<AnalysisResponse["cfg"]> }) {
  return <section aria-label="Control-flow graph" data-testid="control-flow-graph"><div className="flex flex-wrap gap-3">{cfg.procedures?.flatMap((procedure) => procedure.nodes).map((node) => <div key={node.id} data-testid="graph-node" className="rounded border border-emerald-500/50 bg-slate-900 px-3 py-2 text-sm text-white">{node.label}</div>)}</div><div className="mt-3 text-xs text-slate-400">{cfg.procedures?.reduce((total, procedure) => total + procedure.edges.length, 0) ?? 0} edges</div></section>;
}
