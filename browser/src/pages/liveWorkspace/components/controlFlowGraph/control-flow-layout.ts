import ELK from "elkjs/lib/elk.bundled.js";

import type { CfgEdge, CfgNode, VisibleGraph } from "./select-visible-graph";

export interface PositionedGraphNode {
  id: string;
  data: {
    node: CfgNode;
  };
  position: {
    x: number;
    y: number;
  };
  width: number;
  height: number;
}
export interface PositionedGraph {
  nodes: readonly PositionedGraphNode[];
  edges: readonly CfgEdge[];
  width: number;
  height: number;
}
const NODE_WIDTH = 190;
const NODE_HEIGHT = 64;
interface ElkLayoutResult {
  children?: readonly {
    id: string;
    x?: number;
    y?: number;
  }[];
  width?: number;
  height?: number;
}
const COLUMN_GAP = 72;
const ROW_GAP = 28;
/**
 * Deterministic fallback layout used on the first paint and when ELK cannot
 * complete. It is intentionally independent of execution state, so progress
 * markers never move an already positioned graph.
 */
export const layoutGraph = (graph: VisibleGraph): PositionedGraph => {
  const nodes = graph.nodes.map((node, index) => ({
    data: { node },
    height: NODE_HEIGHT,
    id: node.id,
    position: {
      x: (index % 3) * (NODE_WIDTH + COLUMN_GAP),
      y: Math.floor(index / 3) * (NODE_HEIGHT + ROW_GAP),
    },
    width: NODE_WIDTH,
  }));
  const rows = Math.max(1, Math.ceil(nodes.length / 3));
  const columns = Math.min(3, Math.max(1, nodes.length));
  return {
    edges: graph.edges,
    height: rows * NODE_HEIGHT + (rows - 1) * ROW_GAP,
    nodes,
    width: columns * NODE_WIDTH + (columns - 1) * COLUMN_GAP,
  };
};
const elkNode = (node: CfgNode) => ({
  height: NODE_HEIGHT,
  id: node.id,
  width: NODE_WIDTH,
});
/**
 * Use ELK's layered layout after the synchronous fallback has rendered. The
 * input order and node ids are stable, and the caller only invokes this when
 * the immutable graph projection changes.
 */
export const layoutGraphWithElk = async (
  graph: VisibleGraph
): Promise<PositionedGraph> => {
  if (graph.nodes.length === 0) {
    return layoutGraph(graph);
  }
  const elk = new ELK();
  const elkGraph = await elk.layout({
    children: graph.nodes.map(elkNode),
    edges: graph.edges.map((edge, index) => ({
      id: `${edge.from}-${edge.to}-${index}`,
      sources: [edge.from],
      targets: [edge.to],
    })),
    id: "control-flow-graph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(
        ROW_GAP + NODE_HEIGHT
      ),
      "elk.padding": "24",
      "elk.spacing.nodeNode": String(COLUMN_GAP),
    },
  });
  // SAFETY: ELK's runtime result includes dimensions not exposed by its bundled declaration.
  const result = elkGraph as ElkLayoutResult;
  const fallback = layoutGraph(graph);
  const positions = new Map(
    (result.children ?? []).map((node) => [
      node.id,
      { x: node.x ?? 0, y: node.y ?? 0 },
    ])
  );
  const nodes = fallback.nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
  return {
    edges: graph.edges,
    height: result.height ?? fallback.height,
    nodes,
    width: result.width ?? fallback.width,
  };
};
