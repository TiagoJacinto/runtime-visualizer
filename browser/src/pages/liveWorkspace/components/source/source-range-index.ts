import type { AnalysisResponse } from "@runtime-visualizer/contracts";

type ControlFlowGraph = NonNullable<AnalysisResponse["cfg"]>;
type CfgNode = NonNullable<
  ControlFlowGraph["procedures"]
>[number]["nodes"][number];
export interface SourceRange {
  nodeId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
export interface SourceRangeIndex {
  readonly ranges: readonly SourceRange[];
  readonly byNodeId: ReadonlyMap<string, SourceRange>;
}
const nodeRange = (node: CfgNode): SourceRange | null => {
  if (node.location === undefined) {
    return null;
  }
  return {
    endColumn: node.location.end.column,
    endLine: node.location.end.line,
    nodeId: node.id,
    startColumn: node.location.start.column,
    startLine: node.location.start.line,
  };
};
/** Build a revision-local source index from executable CFG locations. */
export const buildSourceRangeIndex = (
  cfg: ControlFlowGraph | null | undefined,
  importsVisible = true
): SourceRangeIndex => {
  const nodes = (
    cfg?.procedures?.flatMap((procedure) => procedure.nodes) ?? []
  ).filter((node) => importsVisible || node.kind.toLowerCase() !== "import");
  const ranges = nodes
    .map(nodeRange)
    .filter((range): range is SourceRange => range !== null)
    .toSorted((a, b) => {
      if (a.startLine !== b.startLine) {
        return a.startLine - b.startLine;
      }
      const aLength = a.endLine - a.startLine;
      const bLength = b.endLine - b.startLine;
      return aLength - bLength || a.startColumn - b.startColumn;
    });
  return {
    byNodeId: new Map(ranges.map((range) => [range.nodeId, range])),
    ranges,
  };
};
const containsLine = (range: SourceRange, line: number): boolean =>
  line >= range.startLine && line <= range.endLine;
/** Return the most specific executable node covering a 1-based source line. */
export const nodeIdAtSourceLine = (
  index: SourceRangeIndex,
  line: number
): string | null =>
  index.ranges.find((range) => containsLine(range, line))?.nodeId ?? null;
export const sourceRangeForNode = (
  index: SourceRangeIndex,
  nodeId: string
): SourceRange | null => index.byNodeId.get(nodeId) ?? null;
export const diagnosticLines = (
  diagnostics: readonly AnalysisResponse["diagnostics"][number][]
): ReadonlySet<number> =>
  new Set(
    diagnostics.flatMap((diagnostic) =>
      diagnostic.location === undefined ? [] : [diagnostic.location.start.line]
    )
  );
