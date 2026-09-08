import type { AnalysisResponse } from "@runtime-visualizer/contracts";

import type { ExecutionRecord } from "../../useCases/live-workspace.types";

interface ControlFlowGraphProps {
  cfg: NonNullable<AnalysisResponse["cfg"]>;
  executions?: readonly ExecutionRecord[];
  selectedExecutionId?: string | null;
}
const EMPTY_EXECUTIONS: readonly ExecutionRecord[] = [];
const markerColors = [
  "bg-sky-400",
  "bg-amber-400",
  "bg-fuchsia-400",
  "bg-lime-400",
];
export const ControlFlowGraph = ({
  cfg,
  executions = EMPTY_EXECUTIONS,
  selectedExecutionId = null,
}: ControlFlowGraphProps) => {
  const nodes = cfg.procedures?.flatMap((procedure) => procedure.nodes) ?? [];
  const edges = cfg.procedures?.flatMap((procedure) => procedure.edges) ?? [];
  return (
    <section aria-label="Control-flow graph" data-testid="control-flow-graph">
      <div className="flex flex-wrap gap-3">
        {nodes.map((node) => {
          const markers = executions.filter(
            (execution) => execution.currentNodeId === node.id
          );
          return (
            <div
              key={node.id}
              data-testid="graph-node"
              aria-current={
                markers.some(
                  (marker) => marker.executionId === selectedExecutionId
                )
                  ? "step"
                  : undefined
              }
              className="rounded border border-emerald-500/50 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              <span>{node.label}</span>
              {markers.length > 0 ? (
                <span className="mt-2 flex gap-1">
                  {markers.map((marker, index) => (
                    <span
                      key={marker.executionId}
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-slate-950 ${markerColors[index % markerColors.length]} ${marker.executionId === selectedExecutionId ? "ring-2 ring-white" : ""}`}
                    >
                      {index + 1}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-slate-400">{edges.length} edges</div>
    </section>
  );
};
