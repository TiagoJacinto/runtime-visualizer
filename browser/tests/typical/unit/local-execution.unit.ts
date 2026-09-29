import type {
  ExecutionWorkerLike,
  ExecutionWorkerReply,
  ExecutionWorkerRequest,
} from "../../../src/modules/execution/index.ts";
import type { ExecutionUpdate } from "../../../src/modules/execution/index.ts";
import { createLocalExecution } from "../../../src/modules/execution/index.ts";
import type { AnalysisSnapshot } from "../../../src/modules/analysis/index.ts";
import type { RevisionHistory } from "../../../src/modules/revision-history/index.ts";
import { describe, expect, it, vi } from "vitest";

const projectId = "project-1";
const scope = {
  file: "src/main.ts",
  procedureId: "function:run",
  revision: "revision-1",
};
const source = "export function run() { oldBehavior(); }";

const snapshot = (text = source): AnalysisSnapshot => ({
  analyzedAt: "2026-09-25T00:00:00.000Z",
  cfg: {
    filePath: scope.file,
    functions: [],
    procedures: [
      {
        edges: [],
        entry: "entry",
        exit: "exit",
        name: "run",
        nodes: [
          { id: "entry", kind: "entry", label: "Entry" },
          { id: "old-node", kind: "statement", label: "oldBehavior()" },
          { id: "exit", kind: "exit", label: "Exit" },
        ],
      },
    ],
  },
  diagnostics: [],
  file: scope.file,
  files: { [scope.file]: text },
  procedure: {
    id: scope.procedureId,
    kind: "Function",
    label: "run",
    name: "run",
  },
  procedureId: scope.procedureId,
  procedures: [
    {
      id: scope.procedureId,
      kind: "Function",
      label: "run",
      name: "run",
    },
  ],
  projectId,
  revision: scope.revision,
  source: text,
});

class TestExecutionWorker implements ExecutionWorkerLike {
  readonly requests: ExecutionWorkerRequest[] = [];
  terminated = false;
  private readonly errorListeners = new Set<(message: string) => void>();
  private readonly messageListeners = new Set<
    (message: ExecutionWorkerReply) => void
  >();

  onError(listener: (message: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onMessage(listener: (message: ExecutionWorkerReply) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  postMessage(request: ExecutionWorkerRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(message: ExecutionWorkerReply): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

const makeHistory = (
  result: AnalysisSnapshot | null = snapshot()
): RevisionHistory => ({
  list: () => Promise.resolve([]),
  load: () => Promise.resolve(result ?? undefined),
  save: () => Promise.resolve("inserted"),
});

const waitForStatus = async (
  updates: readonly ExecutionUpdate[],
  status: ExecutionUpdate["status"]
): Promise<void> => {
  await vi.waitFor(() => {
    expect(updates.at(-1)?.status).toBe(status);
  });
};

describe("browser-local execution", () => {
  it("loads the exact project revision and streams its node updates", async () => {
    const worker = new TestExecutionWorker();
    const load = vi.fn(() => Promise.resolve(snapshot()));
    const history = { ...makeHistory(), load } satisfies RevisionHistory;
    const execution = createLocalExecution(history, projectId, {
      createWorker: () => worker,
      now: () => new Date("2026-09-25T00:00:00.000Z"),
    });
    const updates: ExecutionUpdate[] = [];
    execution.subscribe((update) => updates.push(update));

    const executionId = await execution.start(scope);

    expect(load).toHaveBeenCalledWith({ ...scope, projectId });
    expect(worker.requests[0]?.source).toBe(source);
    expect(updates[0]).toMatchObject({
      executionId,
      scope,
      status: "Running",
    });
    worker.reply({ nodeId: "old-node", type: "node" });
    expect(updates.at(-1)).toMatchObject({ currentNodeId: "old-node" });

    worker.reply({ status: "Succeeded", type: "result" });
    await waitForStatus(updates, "Succeeded");

    expect(await execution.list()).toEqual([]);
    expect(worker.terminated).toBe(true);
    execution.dispose();
  });

  it("terminates the worker when an active revision is cancelled", async () => {
    const worker = new TestExecutionWorker();
    const execution = createLocalExecution(makeHistory(), projectId, {
      createWorker: () => worker,
    });
    const updates: ExecutionUpdate[] = [];
    execution.subscribe((update) => updates.push(update));

    const executionId = await execution.start(scope);
    await execution.cancel(executionId);

    expect(worker.terminated).toBe(true);
    expect(updates.at(-1)).toMatchObject({
      currentNodeId: null,
      status: "Cancelled",
    });
    expect(await execution.list()).toEqual([]);
    execution.dispose();
  });

  it("refuses a missing revision before creating a worker", async () => {
    const createWorker = vi.fn(() => new TestExecutionWorker());
    const execution = createLocalExecution(makeHistory(null), projectId, {
      createWorker,
    });

    await expect(execution.start(scope)).rejects.toThrow("Revision unavailable");

    expect(createWorker).not.toHaveBeenCalled();
    execution.dispose();
  });
});
