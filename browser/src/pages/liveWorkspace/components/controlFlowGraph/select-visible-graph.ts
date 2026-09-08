import type { AnalysisResponse } from "@runtime-visualizer/contracts";

type ControlFlowGraph = NonNullable<AnalysisResponse["cfg"]>;
type ProcedureGraph = NonNullable<ControlFlowGraph["procedures"]>[number];
export type CfgNode = ProcedureGraph["nodes"][number];
export type CfgEdge = ProcedureGraph["edges"][number];
export interface VisibleGraph {
  nodes: readonly CfgNode[];
  edges: readonly CfgEdge[];
}
const isImportNode = (node: CfgNode): boolean =>
  node.kind.toLowerCase() === "import";
/**
 * Select the graph projection for the current operator preference.
 * Import nodes are contextual and can be hidden without changing the
 * immutable analysis snapshot or the execution marker stream.
 */
export const selectVisibleGraph = (
  cfg: ControlFlowGraph,
  importsVisible: boolean
): VisibleGraph => {
  const procedures = cfg.procedures ?? [];
  const nodes = procedures.flatMap((procedure) => procedure.nodes);
  const edges = procedures.flatMap((procedure) => procedure.edges);
  if (importsVisible) {
    return { edges, nodes };
  }
  const importIds = new Set(nodes.filter(isImportNode).map((node) => node.id));
  return {
    edges: edges.filter(
      (edge) => !importIds.has(edge.from) && !importIds.has(edge.to)
    ),
    nodes: nodes.filter((node) => !importIds.has(node.id)),
  };
};
export const isImportCfgNode = (node: CfgNode): boolean => isImportNode(node);
