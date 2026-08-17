import { describe, expect, it } from "vitest";
import type {
  AnalysisResponse,
  ExecutionEvent,
} from "@runtime-visualizer/contracts";
import { createLiveWorkspaceController } from "../../../src/pages/liveWorkspace/useCases/createLiveWorkspaceController";
import type { LiveWorkspacePorts } from "../../../src/pages/liveWorkspace/useCases/liveWorkspace.ports";
import type { LiveWorkspaceState } from "../../../src/pages/liveWorkspace/useCases/liveWorkspace.types";

const analysis: AnalysisResponse = {
  file: "main.ts",
  procedure: {
    id: "top-level",
    kind: "TopLevel",
    name: null,
    label: "Top level",
  },
  revision: "revision-1",
  source: "work();",
  procedures: [
    { id: "top-level", kind: "TopLevel", name: null, label: "Top level" },
  ],
  diagnostics: [],
  cfg: {
    filePath: "main.ts",
    functions: [],
    procedures: [
      {
        name: "Top level",
        nodes: [
          { id: "entry", kind: "entry", label: "Entry" },
          { id: "work", kind: "statement", label: "work()" },
        ],
        edges: [{ from: "entry", to: "work" }],
        entry: "entry",
        exit: "work",
      },
    ],
  },
};

class ExecutionStreamSpy {
  readonly events: ExecutionEvent[] = [];
  readonly waiters: Array<(result: IteratorResult<ExecutionEvent>) => void> =
    [];
  closed = false;
  push(event: ExecutionEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value: event });
    else this.events.push(event);
  }
  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0))
      waiter({ done: true, value: undefined });
  }
  async *iterate(): AsyncGenerator<ExecutionEvent> {
    while (!this.closed || this.events.length > 0) {
      if (this.events.length > 0) yield this.events.shift() as ExecutionEvent;
      else if (this.closed) return;
      else {
        const result = await new Promise<IteratorResult<ExecutionEvent>>(
          (resolve) => this.waiters.push(resolve),
        );
        if (result.done) return;
        yield result.value;
      }
    }
  }
}

function createPorts() {
  const streams = new Map<string, ExecutionStreamSpy>();
  let sequence = 0;
  const ports: LiveWorkspacePorts = {
    analysis: {
      listFiles: async () => ["main.ts"],
      analyse: async () => analysis,
    },
    execution: {
      start: async () => {
        const executionId = `execution-${++sequence}`;
        const stream = new ExecutionStreamSpy();
        streams.set(executionId, stream);
        return {
          executionId,
          events: stream.iterate(),
          cancel: () => stream.close(),
        };
      },
    },
  };
  return { ports, streams };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("live workspace execution observation", () => {
  it("routes overlapping node events by server execution ID", async () => {
    const { ports, streams } = createPorts();
    const controller = createLiveWorkspaceController(ports);
    controller.start();
    await settle();
    controller.runProcedure();
    controller.runProcedure();
    await settle();
    streams
      .get("execution-1")
      ?.push({ event: "node", data: { nodeId: "work" } });
    await settle();
    expect(
      controller
        .getState()
        .executions.map((execution) => execution.currentNodeId),
    ).toEqual(["work", null]);
    controller.dispose();
  });

  it("retains terminal results and clears only active markers", async () => {
    const { ports, streams } = createPorts();
    const controller = createLiveWorkspaceController(ports);
    controller.start();
    await settle();
    controller.runProcedure();
    await settle();
    streams
      .get("execution-1")
      ?.push({ event: "node", data: { nodeId: "work" } });
    streams
      .get("execution-1")
      ?.push({ event: "result", data: { status: "Failed", error: "boom" } });
    await settle();
    expect(controller.getState().executions[0]).toMatchObject({
      status: "failed",
      currentNodeId: null,
      error: "boom",
    });
    controller.clearCompleted();
    expect(controller.getState().executions).toHaveLength(0);
    controller.dispose();
  });

  it("publishes the terminal startup state to a late subscriber", async () => {
    const { ports } = createPorts();
    const controller = createLiveWorkspaceController({
      ...ports,
      analysis: {
        ...ports.analysis,
        analyse: async () => {
          throw new Error("Invalid source");
        },
      },
    });
    controller.start();
    await settle();
    let observed: LiveWorkspaceState | null = null;
    const unsubscribe = controller.subscribe((state) => {
      observed = state;
    });
    expect(observed).not.toBeNull();
    const state = observed!;
    expect(state.status).toBe("error");
    expect(state.error).toBe("Invalid source");
    unsubscribe();
    controller.dispose();
  });

  it("marks a stream interruption without replacing the execution", async () => {
    const { ports, streams } = createPorts();
    const controller = createLiveWorkspaceController(ports);
    controller.start();
    await settle();
    controller.runProcedure();
    await settle();
    streams.get("execution-1")?.close();
    await settle();
    expect(controller.getState().executions[0]).toMatchObject({
      status: "interrupted",
      currentNodeId: null,
    });
    controller.dispose();
  });
});
