import { describe, expect, it } from "vitest";

import {
  buildSourceRangeIndex,
  nodeIdAtSourceLine,
  sourceRangeForNode,
} from "../../../src/pages/liveWorkspace/components/source/source-range-index";
import { cfg } from "./fixtures/graph-source-fixture";

describe("source-range-index", () => {
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
});
