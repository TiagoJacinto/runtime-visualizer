import { describe, expect, it } from "vitest";
import type {
  AnalysisResponse,
  ActiveExecution,
  WorkspaceEvent,
} from "@runtime-visualizer/contracts";
import { createLiveWorkspaceController } from "../../../src/pages/liveWorkspace/useCases/createLiveWorkspaceController";
import type { LiveWorkspacePorts } from "../../../src/pages/liveWorkspace/useCases/liveWorkspace.ports";
import type { LiveWorkspaceState } from "../../../src/pages/liveWorkspace/useCases/liveWorkspace.types";

const analysis: AnalysisResponse = {
  file: "main.ts",
  procedure: { id: "top-level", kind: "TopLevel", name: null, label: "Top level" },
  procedureId: "top-level",
  revision: "revision-1",
  source: "work();",
  procedures: [{ id: "top-level", kind: "TopLevel", name: null, label: "Top level" }],
  diagnostics: [],
  cfg: {
    filePath: "main.ts",
    functions: [],
    procedures: [{
      name: "Top level",
      nodes: [{ id: "entry", kind: "entry", label: "Entry" }, { id: "work", kind: "statement", label: "work()" }],
      edges: [{ from: "entry", to: "work" }],
      entry: "entry",
      exit: "work",
    }],
  },
};

type Record = { id: number; event: WorkspaceEvent };
class WorkspaceEventsSpy {
  readonly waiters: Array<(result: IteratorResult<Record>) => void> = [];
  readonly pending: Record[] = [];
  closed = false;
  private sequence = 0;
  push(event: WorkspaceEvent): void {
    const record = { id: ++this.sequence, event };
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value: record });
    else this.pending.push(record);
  }
  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined });
  }
  async *iterate(signal: AbortSignal): AsyncGenerator<Record> {
    while (!this.closed && !signal.aborted) {
      if (this.pending.length > 0) {
        yield this.pending.shift() as Record;
        continue;
      }
      const result = await new Promise<IteratorResult<Record>>((resolve) => {
        this.waiters.push(resolve);
        signal.addEventListener("abort", () => resolve({ done: true, value: undefined }), { once: true });
      });
      if (result.done) return;
      yield result.value;
    }
  }
}

function active(executionId: string, displayNumber: number): ActiveExecution {
  return {
    executionId,
    displayNumber,
    scope: { file: "main.ts", procedureId: "top-level", revision: "revision-1" },
    startedAt: new Date(displayNumber).toISOString(),
    status: "Running",
    currentNodeId: null,
  };
}

function createPorts(events = new WorkspaceEventsSpy()) {
  let sequence = 0;
  const ports: LiveWorkspacePorts = {
    analysis: {
      listFiles: async () => ["main.ts"],
      analyse: async () => analysis,
      listRevisions: async () => [],
      load: async () => analysis,
    },
    execution: {
      start: async () => `execution-${++sequence}`,
      list: async () => [],
      cancel: async () => undefined,
    },
    workspaceEvents: { subscribe: (signal) => events.iterate(signal) },
  };
  return { ports, events };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("live workspace server event observation", () => {
  it("routes overlapping node updates by server execution ID", async () => {
    const { ports, events } = createPorts();
    const controller = createLiveWorkspaceController(ports);
    controller.start();
    await settle();
    controller.runProcedure();
    controller.runProcedure();
    await settle();
    events.push({ type: "active-executions", executions: [active("execution-1", 1), active("execution-2", 2)] });
    events.push({ type: "execution-update", update: { ...active("execution-1", 1), status: "Running", currentNodeId: "work" } });
    await settle();
    expect(controller.getState().executions.map((execution) => execution.currentNodeId)).toEqual([null, "work"]);
    controller.dispose();
  });

  it("retains terminal results and clears only active markers", async () => {
    const { ports, events } = createPorts();
    const controller = createLiveWorkspaceController(ports);
    controller.start();
    await settle();
    controller.runProcedure();
    await settle();
    events.push({ type: "execution-update", update: { ...active("execution-1", 1), status: "Running", currentNodeId: "work" } });
    events.push({ type: "execution-update", update: { ...active("execution-1", 1), status: "Failed", currentNodeId: null, error: "boom", failedNodeId: "work" } });
    await settle();
    expect(controller.getState().executions[0]).toMatchObject({ status: "failed", currentNodeId: null, error: "boom" });
    controller.clearCompleted();
    expect(controller.getState().executions).toHaveLength(0);
    controller.dispose();
  });

  it("publishes the terminal startup state to a late subscriber", async () => {
    const { ports } = createPorts();
    const controller = createLiveWorkspaceController({ ...ports, analysis: { ...ports.analysis, analyse: async () => { throw new Error("Invalid source"); } } });
    controller.start();
    await settle();
    let observed: LiveWorkspaceState | null = null;
    const unsubscribe = controller.subscribe((state) => { observed = state; });
    expect(observed).not.toBeNull();
    expect(observed!.status).toBe("error");
    expect(observed!.error).toBe("Invalid source");
    unsubscribe();
    controller.dispose();
  });

  it("keeps a selected revision pinned while source changes publish a newer revision", async () => {
    const { ports, events } = createPorts();
    let analysisCalls = 0;
    ports.analysis = { ...ports.analysis, analyse: async () => ({ ...analysis, revision: analysisCalls++ === 0 ? "revision-1" : "revision-2" }) };
    const controller = createLiveWorkspaceController(ports);
    controller.start();
    await settle();
    events.push({ type: "source-change", change: { type: "file-changed", file: "main.ts", change: "modified", revision: "revision-2" } });
    await settle();
    expect(controller.getState().analysis?.revision).toBe("revision-1");
    controller.dispose();
  });

  it("adds files without changing the selected workspace", async () => {
    const { ports, events } = createPorts();
    const controller = createLiveWorkspaceController(ports);
    controller.start();
    await settle();
    events.push({ type: "source-change", change: { type: "file-changed", file: "new.ts", change: "added" } });
    await settle();
    expect(controller.getState().files).toEqual(["main.ts", "new.ts"]);
    expect(controller.getState().selectedFile).toBe("main.ts");
    controller.dispose();
  });

  it("reconnects after the workspace event stream fails", async () => {
    const events = new WorkspaceEventsSpy();
    const { ports } = createPorts(events);
    const scheduled: Array<() => void> = [];
    ports.retry = { schedule: (_delay, task) => { scheduled.push(task); return () => undefined; } };
    const controller = createLiveWorkspaceController(ports);
    controller.start();
    await settle();
    events.close();
    await settle();
    expect(controller.getState().connection).toBe("reconnecting");
    events.closed = false;
    scheduled.shift()?.();
    await settle();
    expect(controller.getState().connection).toBe("connected");
    controller.dispose();
  });
});
