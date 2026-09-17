import { describe, expect, it } from "vitest";

import { selectVisibleGraph } from "../../../src/pages/liveWorkspace/components/controlFlowGraph/select-visible-graph";
import { cfg } from "./fixtures/graph-source-fixture";

describe("selectVisibleGraph", () => {
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
});
