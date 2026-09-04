import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisSnapshot, RevisionLease, RevisionHistory } from "../../../src/modules/analysis/revisionHistory.ts";
import { createExecutionManager } from "../../../src/modules/execution/useCases/executionManager.ts";

const runners: Array<{ node: (id: string) => void; resolve: (value: { status: "Succeeded" | "Failed" | "Cancelled"; events: string[]; error?: string }) => void; signal?: AbortSignal }> = [];
vi.mock("../../../src/modules/execution/useCases/executeProcedure/runner.ts", () => ({
  executeProcedure: vi.fn((_source: string, _file: string, _procedure: unknown, _name: string | undefined, node: (id: string) => void, options: { signal?: AbortSignal }) =>
    new Promise((resolve) => {
      const run = { node, resolve, signal: options.signal };
      runners.push(run);
      options.signal?.addEventListener("abort", () => resolve({ status: "Cancelled", events: [], error: "Execution cancelled." }), { once: true });
    })),
}));

const procedure = { id: "procedure:run", kind: "Function" as const, name: "run", label: "run" };
const snapshot: AnalysisSnapshot = { file: "main.ts", procedure, revision: "rev-1", source: "function run() {}", files: { "main.ts": "function run() {}" }, procedures: [procedure], cfg: { functions: [], procedures: [procedure] } as unknown as AnalysisSnapshot["cfg"], diagnostics: [], analyzedAt: "2025-01-01T00:00:00.000Z" };

function historyFor(release = vi.fn()): RevisionHistory {
  const lease: RevisionLease = { snapshot, release };
  return { list: async () => [], load: async () => snapshot, save: async () => "existing", acquire: async () => lease };
}
const key = { file: "main.ts", procedureId: procedure.id, revision: snapshot.revision };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ExecutionManager", () => {
  beforeEach(() => { runners.length = 0; });
  it("acquires the exact lease, emits ordered updates, and releases once on success", async () => {
    const release = vi.fn(); const manager = createExecutionManager(historyFor(release), { now: () => new Date("2025-01-01T00:00:00Z") });
    const events: unknown[] = []; manager.subscribe((event) => events.push(event));
    const id = await manager.start(key); runners[0]!.node("n1"); runners[0]!.node("n2"); runners[0]!.resolve({ status: "Succeeded", events: ["n1", "n2"] }); await flush();
    expect(events).toMatchObject([{ displayNumber: 1, status: "Running" }, { displayNumber: 1, currentNodeId: "n1" }, { currentNodeId: "n2" }, { executionId: id, status: "Succeeded" }]);
    expect(release).toHaveBeenCalledOnce(); expect(manager.listActive()).toEqual([]); manager.close();
  });

  it("assigns stable display numbers and keeps concurrent runs independent and newest-first", async () => {
    const manager = createExecutionManager(historyFor(), { now: () => new Date("2025-01-01T00:00:00Z") });
    const first = await manager.start(key); const second = await manager.start(key);
    expect(manager.listActive().map((run) => run.displayNumber)).toEqual([2, 1]);
    runners[0]!.resolve({ status: "Succeeded", events: [] }); await flush();
    expect(manager.listActive().map((run) => run.executionId)).toEqual([second]);
    runners[1]!.resolve({ status: "Succeeded", events: [] }); await flush(); expect(first).not.toBe(second); manager.close();
  });

  it("cleans up failed and timed-out terminal outcomes", async () => {
    const release = vi.fn(); const manager = createExecutionManager(historyFor(release));
    const id = await manager.start(key); runners[0]!.node("loop"); runners[0]!.resolve({ status: "Failed", events: ["loop"], error: "Execution timed out." }); await flush();
    expect(manager.listActive()).toEqual([]); expect(release).toHaveBeenCalledOnce(); expect(id).toEqual(expect.any(String)); manager.close();
  });

  it("cancels a run, releases its lease, and returns not-found for unknown IDs", async () => {
    const release = vi.fn(); const manager = createExecutionManager(historyFor(release));
    const id = await manager.start(key); expect(manager.cancel(id)).toBe("cancelled"); await flush();
    expect(manager.cancel(id)).toBe("not-found"); expect(manager.cancel("unknown")).toBe("not-found"); expect(release).toHaveBeenCalledOnce(); manager.close();
  });

  it("fails and cleans up every in-process run when closed", async () => {
    const release = vi.fn(); const manager = createExecutionManager(historyFor(release)); const events: unknown[] = []; manager.subscribe((event) => events.push(event));
    await manager.start(key); manager.close(); manager.close(); await flush();
    expect(events.at(-1)).toMatchObject({ status: "Failed", error: "Backend closed." }); expect(manager.listActive()).toEqual([]); expect(release).toHaveBeenCalledOnce();
    await expect(manager.start(key)).rejects.toThrow("closed");
  });
});
