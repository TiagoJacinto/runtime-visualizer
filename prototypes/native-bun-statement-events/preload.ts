import path from "node:path";
import ts from "typescript";
import { analyseFileProcedure } from "../../browser/src/modules/analysis/cfg/file-analyzer.ts";

interface StatementEvent {
  sequence: number;
  nodeId: string;
  source: string;
  line: number;
  column: number;
  kind: string;
  label: string;
  nodeKey: string;
  procedure: string;
}

type InstrumentedGlobal = typeof globalThis & {
  __rvEmit?: (event: Omit<StatementEvent, "sequence">) => void;
};

const prototypeDirectory = import.meta.dirname;
const fixtureDirectory = path.join(prototypeDirectory, "fixture");
const events: StatementEvent[] = [];
// SAFETY: The optional global field is added before any fixture module can call it.
const instrumentedGlobal = globalThis as InstrumentedGlobal;

instrumentedGlobal.__rvEmit = (event) => {
  const sequencedEvent = { ...event, sequence: events.length + 1 };
  events.push(sequencedEvent);
  process.stderr.write(`LIVE ${JSON.stringify(sequencedEvent)}\n`);
};

process.on("exit", () => {
  process.stderr.write(`REPLAY ${JSON.stringify(events)}\n`);
});

const transformStatements = (source: string, loadedPath: string): string => {
  const sourceFile = ts.createSourceFile(
    loadedPath,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS
  );
  const relativeSource = path.relative(fixtureDirectory, loadedPath);
  const functionName = relativeSource === "workflow.ts" ? "executeWorkflow" : undefined;
  const procedure = functionName ?? relativeSource;
  const graph = analyseFileProcedure(source, relativeSource, { functionName });
  const graphNodes = graph.procedures?.[0]?.nodes ?? [];
  const nodesByPosition = new Map<number, typeof graphNodes>();
  for (const graphNode of graphNodes) {
    if (graphNode.location === undefined) {
      continue;
    }
    const position = sourceFile.getPositionOfLineAndCharacter(
      graphNode.location.start.line - 1,
      graphNode.location.start.column - 1
    );
    nodesByPosition.set(position, [...(nodesByPosition.get(position) ?? []), graphNode]);
  }
  const patches: { position: number; text: string }[] = [];
  const scheduledNodeIds = new Set<string>();

  const nodesAt = (node: ts.Node) => nodesByPosition.get(node.getStart(sourceFile)) ?? [];
  const eventFor = (graphNode: (typeof graphNodes)[number]) => ({
    column: graphNode.location?.start.column ?? 1,
    kind: graphNode.kind,
    label: graphNode.label,
    line: graphNode.location?.start.line ?? 1,
    nodeId: graphNode.id,
    nodeKey: `${relativeSource}#${procedure}#${graphNode.id}`,
    procedure,
    source: relativeSource,
  });
  const eventCalls = (nodes: typeof graphNodes): string =>
    nodes
      .map((graphNode) => `globalThis.__rvEmit?.(${JSON.stringify(eventFor(graphNode))})`)
      .join(", ");

  const insertEvents = (position: number, nodes: typeof graphNodes): void => {
    if (nodes.length === 0) {
      return;
    }
    for (const node of nodes) {
      scheduledNodeIds.add(node.id);
    }
    patches.push({ position, text: `${eventCalls(nodes)};` });
  };

  const traceEachEvaluation = (expression: ts.Expression): void => {
    const nodes = nodesAt(expression);
    const calls = eventCalls(nodes);
    if (calls.length === 0) {
      return;
    }
    for (const node of nodes) {
      scheduledNodeIds.add(node.id);
    }
    patches.push(
      { position: expression.end, text: "))" },
      {
        position: expression.getStart(sourceFile),
        text: `(${calls}, (`,
      }
    );
  };

  const visit = (node: ts.Node): void => {
    if (ts.isExpression(node)) {
      const hasSameStartExpressionParent =
        ts.isExpression(node.parent) &&
        node.parent.getStart(sourceFile) === node.getStart(sourceFile);
      if (!hasSameStartExpressionParent) {
        traceEachEvaluation(node);
      }
    } else if (
      ts.isForStatement(node) &&
      node.initializer !== undefined &&
      !ts.isExpression(node.initializer)
    ) {
      insertEvents(node.getStart(sourceFile), nodesAt(node.initializer));
    } else if (ts.isStatement(node) && !ts.isExpressionStatement(node)) {
      insertEvents(node.getStart(sourceFile), nodesAt(node));
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  const unmappedNodes = graphNodes.filter(
    (node) => node.location !== undefined && !scheduledNodeIds.has(node.id)
  );
  if (unmappedNodes.length > 0) {
    throw new Error(
      `CFG nodes have no runtime instrumentation point: ${unmappedNodes.map((node) => node.id).join(", ")}`
    );
  }
  patches.sort((left, right) => right.position - left.position);

  let transformed = source;
  for (const patch of patches) {
    transformed = `${transformed.slice(0, patch.position)}${patch.text}${transformed.slice(patch.position)}`;
  }
  return transformed;
};

Bun.plugin({
  name: "runtime-visualizer-native-statement-events-prototype",
  setup(build) {
    build.onLoad({ filter: /\.tsx?$/u }, async ({ path: loadedPath }) => {
      if (!loadedPath.startsWith(`${fixtureDirectory}${path.sep}`)) {
        return;
      }

      return {
        contents: transformStatements(await Bun.file(loadedPath).text(), loadedPath),
        loader: loadedPath.endsWith(".tsx") ? "tsx" : "ts",
      };
    });
  },
});
