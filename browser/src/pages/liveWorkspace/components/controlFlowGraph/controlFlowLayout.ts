import ELK from "elkjs/lib/elk.bundled.js";
import type { CfgEdge, CfgNode, VisibleGraph } from "./selectVisibleGraph";

export type PositionedGraphNode = {
  id: string;
  data: { node: CfgNode };
  position: { x: number; y: number };
  width: number;
  height: number;
};

export type PositionedGraph = {
  nodes: readonly PositionedGraphNode[];
  edges: readonly CfgEdge[];
  width: number;
  height: number;
};

const NODE_WIDTH = 190;
const NODE_HEIGHT = 64;
const COLUMN_GAP = 72;
const ROW_GAP = 28;

/**
 * Deterministic fallback layout used on the first paint and when ELK cannot
 * complete. It is intentionally independent of execution state, so progress
 * markers never move an already positioned graph.
 */
export function layoutGraph(graph: VisibleGraph): PositionedGraph {
  const nodes = graph.nodes.map((node, index) => ({
    id: node.id,
    data: { node },
    position: {
      x: (index % 3) * (NODE_WIDTH + COLUMN_GAP),
      y: Math.floor(index / 3) * (NODE_HEIGHT + ROW_GAP),
    },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }));
  const rows = Math.max(1, Math.ceil(nodes.length / 3));
  const columns = Math.min(3, Math.max(1, nodes.length));
  return {
    nodes,
    edges: graph.edges,
    width: columns * NODE_WIDTH + (columns - 1) * COLUMN_GAP,
    height: rows * NODE_HEIGHT + (rows - 1) * ROW_GAP,
  };
}

function elkNode(node: CfgNode) {
  return { id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT };
}

/**
 * Use ELK's layered layout after the synchronous fallback has rendered. The
 * input order and node ids are stable, and the caller only invokes this when
 * the immutable graph projection changes.
 */
export async function layoutGraphWithElk(
  graph: VisibleGraph,
): Promise<PositionedGraph> {
  if (graph.nodes.length === 0) return layoutGraph(graph);
  const elk = new ELK();
  // SAFETY: ELK's runtime result includes dimensions not exposed by its bundled declaration.
  const result = (await elk.layout({
    id: "control-flow-graph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(
        ROW_GAP + NODE_HEIGHT,
      ),
      "elk.spacing.nodeNode": String(COLUMN_GAP),
      "elk.padding": "24",
    },
    children: graph.nodes.map(elkNode),
    edges: graph.edges.map((edge, index) => ({
      id: `${edge.from}-${edge.to}-${index}`,
      sources: [edge.from],
      targets: [edge.to],
    })),
  })) as unknown as {
    children?: readonly { id: string; x?: number; y?: number }[];
    width?: number;
    height?: number;
  };
  const fallback = layoutGraph(graph);
  const positions = new Map(
    (result.children ?? []).map((node) => [
      node.id,
      { x: node.x ?? 0, y: node.y ?? 0 },
    ]),
  );
  const nodes = fallback.nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
  return {
    nodes,
    edges: graph.edges,
    width: result.width ?? fallback.width,
    height: result.height ?? fallback.height,
  };
}
