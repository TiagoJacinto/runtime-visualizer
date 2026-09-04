import type { AnalysisResponse } from "@runtime-visualizer/contracts";

type ControlFlowGraph = NonNullable<AnalysisResponse["cfg"]>;
type CfgNode = NonNullable<
  ControlFlowGraph["procedures"]
>[number]["nodes"][number];

export type SourceRange = {
  nodeId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type SourceRangeIndex = {
  readonly ranges: readonly SourceRange[];
  readonly byNodeId: ReadonlyMap<string, SourceRange>;
};

function nodeRange(node: CfgNode): SourceRange | null {
  if (node.location === undefined) return null;
  return {
    nodeId: node.id,
    startLine: node.location.start.line,
    startColumn: node.location.start.column,
    endLine: node.location.end.line,
    endColumn: node.location.end.column,
  };
}

/** Build a revision-local source index from executable CFG locations. */
export function buildSourceRangeIndex(
  cfg: ControlFlowGraph | null | undefined,
  importsVisible = true,
): SourceRangeIndex {
  const nodes = (
    cfg?.procedures?.flatMap((procedure) => procedure.nodes) ?? []
  ).filter((node) => importsVisible || node.kind.toLowerCase() !== "import");
  const ranges = nodes
    .map(nodeRange)
    .filter((range): range is SourceRange => range !== null)
    .sort((a, b) => {
      if (a.startLine !== b.startLine) return a.startLine - b.startLine;
      const aLength = a.endLine - a.startLine;
      const bLength = b.endLine - b.startLine;
      return aLength - bLength || a.startColumn - b.startColumn;
    });
  return {
    ranges,
    byNodeId: new Map(ranges.map((range) => [range.nodeId, range])),
  };
}

function containsLine(range: SourceRange, line: number): boolean {
  return line >= range.startLine && line <= range.endLine;
}

/** Return the most specific executable node covering a 1-based source line. */
export function nodeIdAtSourceLine(
  index: SourceRangeIndex,
  line: number,
): string | null {
  return (
    index.ranges.find((range) => containsLine(range, line))?.nodeId ?? null
  );
}

export function sourceRangeForNode(
  index: SourceRangeIndex,
  nodeId: string,
): SourceRange | null {
  return index.byNodeId.get(nodeId) ?? null;
}

export function diagnosticLines(
  diagnostics: readonly AnalysisResponse["diagnostics"][number][],
): ReadonlySet<number> {
  return new Set(
    diagnostics.flatMap((diagnostic) =>
      diagnostic.location === undefined ? [] : [diagnostic.location.start.line],
    ),
  );
}
