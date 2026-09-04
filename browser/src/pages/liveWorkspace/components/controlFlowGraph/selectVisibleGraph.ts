import type { AnalysisResponse } from "@runtime-visualizer/contracts";

type ControlFlowGraph = NonNullable<AnalysisResponse["cfg"]>;
type ProcedureGraph = NonNullable<ControlFlowGraph["procedures"]>[number];
export type CfgNode = ProcedureGraph["nodes"][number];
export type CfgEdge = ProcedureGraph["edges"][number];

export type VisibleGraph = {
  nodes: readonly CfgNode[];
  edges: readonly CfgEdge[];
};

function isImportNode(node: CfgNode): boolean {
  return node.kind.toLowerCase() === "import";
}

/**
 * Select the graph projection for the current operator preference.
 * Import nodes are contextual and can be hidden without changing the
 * immutable analysis snapshot or the execution marker stream.
 */
export function selectVisibleGraph(
  cfg: ControlFlowGraph,
  importsVisible: boolean,
): VisibleGraph {
  const procedures = cfg.procedures ?? [];
  const nodes = procedures.flatMap((procedure) => procedure.nodes);
  const edges = procedures.flatMap((procedure) => procedure.edges);
  if (importsVisible) return { nodes, edges };

  const importIds = new Set(
    nodes.filter(isImportNode).map((node) => node.id),
  );
  return {
    nodes: nodes.filter((node) => !importIds.has(node.id)),
    edges: edges.filter(
      (edge) => !importIds.has(edge.from) && !importIds.has(edge.to),
    ),
  };
}

export function isImportCfgNode(node: CfgNode): boolean {
  return isImportNode(node);
}
