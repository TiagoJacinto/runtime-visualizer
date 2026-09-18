import { describe, expect, it } from "vitest";

import {
  layoutGraph,
  layoutGraphWithElk,
} from "../../../src/pages/liveWorkspace/components/controlFlowGraph/control-flow-layout";
import { selectVisibleGraph } from "../../../src/pages/liveWorkspace/components/controlFlowGraph/select-visible-graph";
import { cfg } from "./fixtures/graph-source-fixture";

describe("control-flow layout", () => {
  it("keeps node positions stable when only execution progress changes", () => {
    const graph = selectVisibleGraph(cfg, true);
    const first = layoutGraph(graph);
    const afterProgress = layoutGraph(graph);

    expect(afterProgress.nodes.map((node) => node.position)).toEqual(
      first.nodes.map((node) => node.position)
    );
    expect(afterProgress.nodes.map((node) => node.id)).toEqual(
      first.nodes.map((node) => node.id)
    );
  });

  it("lays out an empty graph and an immutable graph with ELK", async () => {
    const empty = await layoutGraphWithElk({ nodes: [], edges: [] });
    expect(empty.nodes).toEqual([]);

    const laidOut = await layoutGraphWithElk(selectVisibleGraph(cfg, true));
    expect(laidOut.nodes).toHaveLength(cfg.procedures?.[0]?.nodes.length ?? 0);
    expect(laidOut.edges).toEqual(cfg.procedures?.[0]?.edges ?? []);
    expect(laidOut.width).toBeGreaterThan(0);
    expect(laidOut.height).toBeGreaterThan(0);
  });
});
