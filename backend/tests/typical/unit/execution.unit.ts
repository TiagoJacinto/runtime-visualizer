import { describe, expect, it } from "vitest";

import { Execution } from "../../../src/modules/execution/index.ts";

const initial = {
  executionId: "execution-1",
  displayNumber: 1,
  scope: {
    file: "main.ts",
    procedureId: "procedure:run",
    revision: "revision-1",
  },
  startedAt: "2025-01-01T00:00:00.000Z",
} as const;

describe("Execution", () => {
  it("starts as a running execution with no highlighted node", () => {
    expect(new Execution(initial).snapshot()).toEqual({
      ...initial,
      status: "Running",
      currentNodeId: null,
    });
  });

  it("advances the current node while remaining running", () => {
    const execution = new Execution(initial);

    expect(execution.advanceTo("node-1")).toEqual({
      ...initial,
      status: "Running",
      currentNodeId: "node-1",
    });
    expect(execution.snapshot().currentNodeId).toBe("node-1");
  });

  it("records a failed node and rejects transitions after completion", () => {
    const execution = new Execution(initial);
    execution.advanceTo("node-1");

    expect(execution.finish("Failed", "Execution timed out.")).toEqual({
      ...initial,
      status: "Failed",
      currentNodeId: "node-1",
      error: "Execution timed out.",
      failedNodeId: "node-1",
    });
    expect(() => execution.advanceTo("node-2")).toThrow("terminal");
    expect(() => execution.finish("Cancelled")).toThrow("terminal");
  });
});
