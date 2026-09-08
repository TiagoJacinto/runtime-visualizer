import type {
  AnalysisResponse,
  RevisionKey,
} from "@runtime-visualizer/contracts";
import { Background, Controls, MarkerType, ReactFlow } from "@xyflow/react";
import type { Edge, ReactFlowInstance } from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ExecutionRecord,
  FocusTarget,
} from "../../useCases/live-workspace.types";
import { layoutGraph, layoutGraphWithElk } from "./control-flow-layout";
import type { PositionedGraph } from "./control-flow-layout";
import { ControlFlowNode } from "./control-flow-node";
import type { ControlFlowFlowNode } from "./control-flow-node";
import { selectVisibleGraph } from "./select-visible-graph";

const nodeTypes = { controlFlow: ControlFlowNode };
const EMPTY_EXECUTIONS: readonly ExecutionRecord[] = [];
interface GraphPaneProps {
  cfg: NonNullable<AnalysisResponse["cfg"]>;
  scope: RevisionKey;
  focus: FocusTarget | null;
  executions?: readonly ExecutionRecord[];
  selectedExecutionId?: string | null;
  importsVisible: boolean;
  onFocus: (target: FocusTarget | null) => void;
  onImportsVisibleChange: (visible: boolean) => void;
}
interface KeyedLayout {
  key: string;
  value: PositionedGraph;
}
const graphKey = (
  graph: ReturnType<typeof selectVisibleGraph>,
  importsVisible: boolean
): string =>
  [
    importsVisible ? "imports" : "no-imports",
    graph.nodes.map((node) => node.id).join(","),
    graph.edges.map((edge) => `${edge.from}>${edge.to}`).join(","),
  ].join("|");
export const GraphPane = ({
  cfg,
  scope,
  focus,
  executions = EMPTY_EXECUTIONS,
  selectedExecutionId = null,
  importsVisible,
  onFocus,
  onImportsVisibleChange,
}: GraphPaneProps) => {
  const visibleGraph = useMemo(
    () => selectVisibleGraph(cfg, importsVisible),
    [cfg, importsVisible]
  );
  const layoutKey = useMemo(
    () =>
      `${scope.file}\0${scope.procedureId}\0${scope.revision}|${graphKey(visibleGraph, importsVisible)}`,
    [
      importsVisible,
      scope.file,
      scope.procedureId,
      scope.revision,
      visibleGraph,
    ]
  );
  const fallback = useMemo(() => layoutGraph(visibleGraph), [visibleGraph]);
  const [elkLayout, setElkLayout] = useState<KeyedLayout | null>(null);
  const flowRef = useRef<ReactFlowInstance<ControlFlowFlowNode> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loadLayout = async (): Promise<void> => {
      try {
        const value = await layoutGraphWithElk(visibleGraph);
        if (!cancelled) {
          setElkLayout({ key: layoutKey, value });
        }
      } catch {
        // The deterministic fallback remains usable if ELK is unavailable.
      }
    };
    void loadLayout();
    return () => {
      cancelled = true;
    };
  }, [layoutKey, visibleGraph]);
  const layout = elkLayout?.key === layoutKey ? elkLayout.value : fallback;
  const focusedNodeId =
    focus?.scope.file === scope.file &&
    focus.scope.procedureId === scope.procedureId &&
    focus.scope.revision === scope.revision
      ? focus.nodeId
      : null;
  const flowNodes = useMemo<ControlFlowFlowNode[]>(
    () =>
      layout.nodes.map((positioned) => ({
        data: {
          focused: positioned.id === focusedNodeId,
          markers: executions.filter(
            (execution) => execution.currentNodeId === positioned.id
          ),
          node: positioned.data.node,
          onFocus,
          scope,
          selectedExecutionId,
        },
        draggable: false,
        id: positioned.id,
        position: positioned.position,
        selectable: false,
        type: "controlFlow",
      })),
    [
      executions,
      focusedNodeId,
      layout.nodes,
      onFocus,
      scope,
      selectedExecutionId,
    ]
  );
  const flowEdges = useMemo<Edge[]>(
    () =>
      layout.edges.map((edge, index) => ({
        id: `${edge.from}-${edge.to}-${index}`,
        label: edge.label ?? edge.kind,
        labelStyle: { fill: "#94a3b8", fontSize: 10 },
        markerEnd: { color: "#34d399", type: MarkerType.ArrowClosed },
        source: edge.from,
        style: { stroke: "#34d399", strokeWidth: 1.5 },
        target: edge.to,
      })),
    [layout.edges]
  );
  return (
    <section
      aria-label="Control-flow graph"
      data-testid="control-flow-graph"
      className="overflow-hidden rounded border border-emerald-500/30 bg-slate-950"
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h3 className="font-medium text-slate-100">Control flow</h3>
          <p className="font-mono text-xs text-slate-500">
            {visibleGraph.nodes.length} nodes · {visibleGraph.edges.length}{" "}
            edges
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={importsVisible}
              aria-label="Show imports"
              onChange={(event) => onImportsVisibleChange(event.target.checked)}
            />
            Show imports
          </label>
          <button
            type="button"
            onClick={() =>
              flowRef.current?.fitView({ duration: 180, padding: 0.2 })
            }
            className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:border-emerald-400"
          >
            Fit graph
          </button>
        </div>
      </div>
      <div className="h-[28rem] min-h-[22rem]" data-testid="graph-canvas">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          nodesFocusable
          edgesFocusable={false}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          aria-label="Positioned control-flow graph"
        >
          <Background color="#18352b" gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
};
