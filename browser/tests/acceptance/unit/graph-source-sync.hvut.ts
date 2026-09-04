import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnalysisResponse, RevisionKey } from "@runtime-visualizer/contracts";
import { ControlFlowNode } from "../../../src/pages/liveWorkspace/components/controlFlowGraph/ControlFlowNode";
import { layoutGraph } from "../../../src/pages/liveWorkspace/components/controlFlowGraph/controlFlowLayout";
import { selectVisibleGraph } from "../../../src/pages/liveWorkspace/components/controlFlowGraph/selectVisibleGraph";
import { SourcePane } from "../../../src/pages/liveWorkspace/components/source/SourcePane";
import {
  buildSourceRangeIndex,
  nodeIdAtSourceLine,
  sourceRangeForNode,
} from "../../../src/pages/liveWorkspace/components/source/sourceRangeIndex";
import { reduceWorkspace } from "../../../src/pages/liveWorkspace/useCases/liveWorkspace.reducer";
import { initialLiveWorkspaceState } from "../../../src/pages/liveWorkspace/useCases/liveWorkspace.types";

const scope: RevisionKey = {
  file: "main.ts",
  procedureId: "function:run",
  revision: "revision-1",
};

const analysis: AnalysisResponse = {
  file: scope.file,
  procedure: {
    id: scope.procedureId,
    kind: "Function",
    name: "run",
    label: "run",
  },
  procedureId: scope.procedureId,
  revision: scope.revision,
  source: "import { value } from './value';\nfunction run() {\n  return value;\n}",
  procedures: [
    { id: scope.procedureId, kind: "Function", name: "run", label: "run" },
  ],
  cfg: {
    functions: [],
    procedures: [
      {
        name: "run",
        entry: "entry",
        exit: "exit",
        nodes: [
          { id: "import", kind: "import", label: "value", location: { start: { line: 1, column: 1 }, end: { line: 1, column: 38 } } },
          { id: "entry", kind: "entry", label: "entry" },
          { id: "return", kind: "return", label: "return value", location: { start: { line: 3, column: 3 }, end: { line: 3, column: 15 } } },
          { id: "exit", kind: "exit", label: "exit" },
        ],
        edges: [
          { from: "import", to: "entry", kind: "entry" },
          { from: "entry", to: "return", kind: "next" },
          { from: "return", to: "exit", kind: "next" },
        ],
      },
    ],
  },
  diagnostics: [],
};

const cfg = analysis.cfg;
if (cfg === null) throw new Error("test fixture must include a graph");

describe("graph-source-sync", () => {
  it("projects imports without mutating the immutable CFG", () => {
    const withImports = selectVisibleGraph(cfg, true);
    const withoutImports = selectVisibleGraph(cfg, false);

    expect(withImports.nodes.map((node) => node.id)).toContain("import");
    expect(withoutImports.nodes.map((node) => node.id)).not.toContain("import");
    expect(withoutImports.edges).toEqual([
      { from: "entry", to: "return", kind: "next" },
      { from: "return", to: "exit", kind: "next" },
    ]);
    expect(cfg.procedures?.[0]?.nodes[0]?.id).toBe("import");
  });

  it("keeps node positions stable when only execution progress changes", () => {
    const graph = selectVisibleGraph(cfg, true);
    const first = layoutGraph(graph);
    const afterProgress = layoutGraph(graph);

    expect(afterProgress.nodes.map((node) => node.position)).toEqual(
      first.nodes.map((node) => node.position),
    );
    expect(afterProgress.nodes.map((node) => node.id)).toEqual(
      first.nodes.map((node) => node.id),
    );
  });

  it("maps executable source ranges to the same node focus target", () => {
    const index = buildSourceRangeIndex(cfg);
    const importsHiddenIndex = buildSourceRangeIndex(cfg, false);

    expect(nodeIdAtSourceLine(index, 1)).toBe("import");
    expect(nodeIdAtSourceLine(importsHiddenIndex, 1)).toBeNull();
    expect(nodeIdAtSourceLine(index, 2)).toBeNull();
    expect(nodeIdAtSourceLine(index, 3)).toBe("return");
    expect(sourceRangeForNode(index, "return")?.startLine).toBe(3);
    expect(sourceRangeForNode(index, "entry")).toBeNull();
  });

  it("keeps non-executable lines neutral and escapes source text", () => {
    const markup = renderToStaticMarkup(
      createElement(SourcePane, {
        source: '<script>alert("not html")</script>\nreturn value;',
        cfg,
        scope,
        focus: null,
        onFocus: () => undefined,
      }),
    );

    expect(markup).toContain("Source line 2, not executable");
    expect(markup).toContain("&lt;script&gt;alert");
    expect(markup).not.toContain('<script>alert("not html")</script>');
  });

  it("gives each live marker and focus origin an accessible label", () => {
    const marker = {
      executionId: "execution-1",
      displayNumber: 7,
      scope,
      status: "running" as const,
      currentNodeId: "return",
      error: null,
      file: scope.file,
      procedure: scope.procedureId,
      revision: scope.revision,
    };
    const markup = renderToStaticMarkup(
      createElement(ControlFlowNode, {
        data: {
          node: cfg.procedures?.[0]?.nodes[2] ?? { id: "return", kind: "return", label: "return" },
          focused: true,
          markers: [marker],
          selectedExecutionId: marker.executionId,
          onFocus: () => undefined,
          scope,
        },
      }),
    );

    expect(markup).toContain('aria-label="Graph node return value"');
    expect(markup).toContain('aria-label="Execution 7, running"');
    expect(markup).toContain('data-focused="true"');
  });

  it("stores graph, source, and failure focus as one neutral target", () => {
    const graphFocus = reduceWorkspace(initialLiveWorkspaceState, {
      type: "focus",
      target: { scope, nodeId: "return", origin: "graph" },
    }).state;
    const sourceFocus = reduceWorkspace(graphFocus, {
      type: "focus",
      target: { scope, nodeId: "return", origin: "source" },
    }).state;
    const failureFocus = reduceWorkspace(sourceFocus, {
      type: "focus",
      target: { scope, nodeId: "return", origin: "failure" },
    }).state;

    expect(graphFocus.focus?.nodeId).toBe("return");
    expect(sourceFocus.focus).toEqual({ scope, nodeId: "return", origin: "source" });
    expect(failureFocus.focus).toEqual({ scope, nodeId: "return", origin: "failure" });
  });
});
