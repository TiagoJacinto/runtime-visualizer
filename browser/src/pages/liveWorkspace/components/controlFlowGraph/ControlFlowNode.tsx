import type { Node, NodeProps } from "@xyflow/react";
import type { ExecutionRecord, FocusTarget } from "../../useCases/liveWorkspace.types";
import type { CfgNode } from "./selectVisibleGraph";

export type ControlFlowNodeData = {
  node: CfgNode;
  focused: boolean;
  markers: readonly ExecutionRecord[];
  selectedExecutionId: string | null;
  onFocus: (target: FocusTarget) => void;
  scope: FocusTarget["scope"];
};

const markerColors = [
  "bg-sky-400",
  "bg-amber-400",
  "bg-fuchsia-400",
  "bg-lime-400",
];

export type ControlFlowFlowNode = Node<ControlFlowNodeData, "controlFlow">;

type ControlFlowNodeProps = Pick<NodeProps<ControlFlowFlowNode>, "data">;

export function ControlFlowNode({ data }: ControlFlowNodeProps) {
  const { node, focused, markers, selectedExecutionId, onFocus, scope } = data;
  return (
    <button
      type="button"
      data-testid="graph-node"
      data-node-id={node.id}
      data-focused={focused ? "true" : "false"}
      aria-label={`Graph node ${node.label}`}
      aria-pressed={focused}
      onClick={() => onFocus({ scope, nodeId: node.id, origin: "graph" })}
      className={`w-[190px] rounded border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300 ${focused ? "border-emerald-200 bg-emerald-950/80 ring-2 ring-emerald-300/70" : "border-emerald-500/50 bg-slate-900 hover:border-emerald-300"}`}
    >
      <span className="block truncate font-medium text-slate-100">{node.label}</span>
      <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-slate-500">
        {node.kind}
      </span>
      {markers.length > 0 ? (
        <span
          className="mt-2 flex gap-1"
          aria-label={`${markers.length} live execution marker${markers.length === 1 ? "" : "s"}`}
        >
          {markers.map((marker, index) => (
            <span
              key={marker.executionId}
              data-testid="execution-marker"
              aria-label={`Execution ${marker.displayNumber ?? index + 1}, ${marker.status}`}
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-slate-950 ${markerColors[index % markerColors.length]} ${marker.executionId === selectedExecutionId ? "ring-2 ring-white" : ""}`}
            >
              {marker.displayNumber ?? index + 1}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}
