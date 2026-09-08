import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  AnalysisResponse,
  RevisionKey,
} from "@runtime-visualizer/contracts";
import type {
  ExecutionRecord,
  FocusTarget,
} from "../../useCases/liveWorkspace.types";
import { ControlFlowNode, type ControlFlowFlowNode } from "./ControlFlowNode";
import {
  layoutGraph,
  layoutGraphWithElk,
  type PositionedGraph,
} from "./controlFlowLayout";
import { selectVisibleGraph } from "./selectVisibleGraph";

const nodeTypes = { controlFlow: ControlFlowNode };

type GraphPaneProps = {
  cfg: NonNullable<AnalysisResponse["cfg"]>;
  scope: RevisionKey;
  focus: FocusTarget | null;
  executions?: readonly ExecutionRecord[];
  selectedExecutionId?: string | null;
  importsVisible: boolean;
  onFocus: (target: FocusTarget | null) => void;
  onImportsVisibleChange: (visible: boolean) => void;
};

type KeyedLayout = { key: string; value: PositionedGraph };

function graphKey(
  graph: ReturnType<typeof selectVisibleGraph>,
  importsVisible: boolean,
): string {
  return [
    importsVisible ? "imports" : "no-imports",
    graph.nodes.map((node) => node.id).join(","),
    graph.edges.map((edge) => `${edge.from}>${edge.to}`).join(","),
  ].join("|");
}

export function GraphPane({
  cfg,
  scope,
  focus,
  executions = [],
  selectedExecutionId = null,
  importsVisible,
  onFocus,
  onImportsVisibleChange,
}: GraphPaneProps) {
  const visibleGraph = useMemo(
    () => selectVisibleGraph(cfg, importsVisible),
    [cfg, importsVisible],
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
    ],
  );
  const fallback = useMemo(() => layoutGraph(visibleGraph), [visibleGraph]);
  const [elkLayout, setElkLayout] = useState<KeyedLayout | null>(null);
  const flowRef = useRef<ReactFlowInstance<ControlFlowFlowNode> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void layoutGraphWithElk(visibleGraph)
      .then((value) => {
        if (!cancelled) setElkLayout({ key: layoutKey, value });
      })
      .catch(() => {
        // The deterministic fallback remains usable if ELK is unavailable.
      });
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
        id: positioned.id,
        type: "controlFlow",
        position: positioned.position,
        data: {
          node: positioned.data.node,
          focused: positioned.id === focusedNodeId,
          markers: executions.filter(
            (execution) => execution.currentNodeId === positioned.id,
          ),
          selectedExecutionId,
          onFocus,
          scope,
        },
        draggable: false,
        selectable: false,
      })),
    [
      executions,
      focusedNodeId,
      layout.nodes,
      onFocus,
      scope,
      selectedExecutionId,
    ],
  );
  const flowEdges = useMemo<Edge[]>(
    () =>
      layout.edges.map((edge, index) => ({
        id: `${edge.from}-${edge.to}-${index}`,
        source: edge.from,
        target: edge.to,
        label: edge.label ?? edge.kind,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#34d399" },
        style: { stroke: "#34d399", strokeWidth: 1.5 },
        labelStyle: { fill: "#94a3b8", fontSize: 10 },
      })),
    [layout.edges],
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
              flowRef.current?.fitView({ padding: 0.2, duration: 180 })
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
}
