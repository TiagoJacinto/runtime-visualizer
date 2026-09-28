/* oxlint-disable avoid-new -- IndexedDB exposes event-based requests, not awaitable promises. */
import "fake-indexeddb/auto";

import type {
  ExecutionWorkerLike,
  ExecutionWorkerReply,
  ExecutionWorkerRequest,
} from "../../../src/modules/execution/index.ts";
import type { ExecutionUpdate } from "@runtime-visualizer/contracts";
import { createLocalExecution } from "../../../src/modules/execution/index.ts";
import type { AnalysisSnapshot } from "../../../src/modules/analysis/index.ts";
import { IndexedDbRevisionHistory } from "../../../src/modules/revision-history/index.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DATABASE = "runtime-visualizer";
const file = "src/main.ts";
const procedureId = "function:run";
const projectId = "project-one";

const snapshot = (revision: string, source: string): AnalysisSnapshot => ({
  analyzedAt: "2026-09-25T00:00:00.000Z",
  cfg: {
    filePath: file,
    functions: [],
    procedures: [
      {
        edges: [],
        entry: "entry",
        exit: "exit",
        name: "run",
        nodes: [
          { id: "entry", kind: "entry", label: "Entry" },
          {
            id: `node-${revision}`,
            kind: "statement",
            label: revision === "revision-1" ? "oldBehavior()" : "newBehavior()",
          },
          { id: "exit", kind: "exit", label: "Exit" },
        ],
      },
    ],
  },
  diagnostics: [],
  file,
  files: { [file]: source },
  procedure: {
    id: procedureId,
    kind: "Function",
    label: "run",
    name: "run",
  },
  procedureId,
  procedures: [
    {
      id: procedureId,
      kind: "Function",
      label: "run",
      name: "run",
    },
  ],
  projectId,
  revision,
  source,
});

class RecordingWorker implements ExecutionWorkerLike {
  request: ExecutionWorkerRequest | undefined;
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
    this.request = request;
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

const deleteDatabase = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Unable to reset IndexedDB."))
    );
  });

beforeEach(async () => {
  await deleteDatabase();
});

describe("local execution with persisted revisions", () => {
  it("runs the selected saved source and reports its graph progress", async () => {
    const history = new IndexedDbRevisionHistory();
    const oldSource = "export function run() { oldBehavior(); }";
    const newSource = "export function run() { newBehavior(); }";
    await history.save(snapshot("revision-1", oldSource));
    await history.save(snapshot("revision-2", newSource));
    const worker = new RecordingWorker();
    const execution = createLocalExecution(history, projectId, {
      createWorker: () => worker,
    });
    const updates: ExecutionUpdate[] = [];
    execution.subscribe((update) => updates.push(update));

    await execution.start({ file, procedureId, revision: "revision-1" });

    expect(worker.request).toMatchObject({ filePath: file, source: oldSource });
    expect(updates[0]).toMatchObject({
      scope: { file, procedureId, revision: "revision-1" },
      status: "Running",
    });
    worker.reply({ nodeId: "node-revision-1", type: "node" });
    expect(updates.at(-1)).toMatchObject({
      currentNodeId: "node-revision-1",
      status: "Running",
    });

    worker.reply({ status: "Succeeded", type: "result" });
    await vi.waitFor(() => expect(updates.at(-1)?.status).toBe("Succeeded"));

    expect(worker.terminated).toBe(true);
    execution.dispose();
  });
});
