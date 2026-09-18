import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ControlFlowNode } from "../../../src/pages/liveWorkspace/components/controlFlowGraph/control-flow-node";
import { SourcePane } from "../../../src/pages/liveWorkspace/components/source/source-pane";
import { cfg, scope } from "./fixtures/graph-source-fixture";

describe("live workspace graph and source components", () => {
  it("keeps non-executable lines neutral and escapes source text", () => {
    const markup = renderToStaticMarkup(
      createElement(SourcePane, {
        source: '<script>alert("not html")</script>\nreturn value;',
        cfg,
        scope,
        focus: null,
        onFocus: () => undefined,
      })
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
          node: cfg.procedures?.[0]?.nodes[2] ?? {
            id: "return",
            kind: "return",
            label: "return",
          },
          focused: true,
          markers: [marker],
          selectedExecutionId: marker.executionId,
          onFocus: () => undefined,
          scope,
        },
      })
    );

    expect(markup).toContain('aria-label="Graph node return value"');
    expect(markup).toContain('aria-label="Execution 7, running"');
    expect(markup).toContain('data-focused="true"');
  });
});
