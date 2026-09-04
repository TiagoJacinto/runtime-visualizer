import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { AgentCall, type SSSFConfig } from "./data_types";
import { InMemoryAgent } from "./agent";
import { Run, type RunDependencies, type WorkspaceAdapter } from "./runner";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup(dependencies: RunDependencies = {}) {
  const root = mkdtempSync(join(tmpdir(), "sssf-runner-test-"));
  roots.push(root);
  const cfg = {
    defaults: {
      data_dir: join(root, "data"),
      run_timeout_seconds: 30,
      harness_timeout_seconds: 1,
      max_output_bytes: 1000,
    },
    observability: { db: join(root, "trace.db"), poll_ms: 1 },
    agents: [],
  } as unknown as SSSFConfig;
  const tracer = {
    maxPhaseSeq: () => 0,
    event: () => "event",
    phaseUpsert: () => undefined,
    sessionRequest: () => undefined,
    sessionAddUsage: () => undefined,
    sessionFinish: () => undefined,
  } as any;
  return { root, run: new Run(cfg, "test-run", tracer, "test-engineer", dependencies) };
}

function fakeWorkspace(root: string, calls: string[]): WorkspaceAdapter {
  return {
    isRepository: () => true,
    inspectSource: () => ({ revision: "revision-1", workingTree: "Clean" }),
    cloneRepository: (_source, destination) => {
      calls.push(`clone:${destination}`);
      return destination;
    },
    copyRepository: (_source, destination) => calls.push(`copy:${destination}`),
  };
}

const agentResult = { status: "success" as const, summary: "ok" };

describe("Run execution", () => {
  test("runs phases in order and records final success", async () => {
    const { run } = setup({ agent: new InMemoryAgent([agentResult]) });
    const order: string[] = [];

    await run.phase(
      { name: "first", kind: "agent", owner: "fake", description: "Records the first phase." },
      async (phase) => {
        order.push("first");
        await phase.call(new AgentCall("GenericOutput", "first"));
      },
    );
    await run.phase(
      { name: "second", kind: "code", owner: "engineer", description: "Records the second phase." },
      () => {
        order.push("second");
      },
    );

    expect(order).toEqual(["first", "second"]);
    expect(run.phases.map((phase) => phase.status)).toEqual(["success", "success"]);
    expect(run.finish()).toBe(0);
  });

  test("records failure and final status when a phase throws", async () => {
    const { run } = setup();

    await expect(
      run.phase(
        { name: "broken", kind: "code", owner: "engineer", description: "Rejects the phase." },
        () => {
          throw new Error("expected failure");
        },
      ),
    ).rejects.toThrow("expected failure");

    expect(run.phases[0]).toMatchObject({ status: "fail", error: "expected failure" });
    expect(run.finish()).toBe(1);
    expect(readFileSync(join(run.runEvidenceDir, "result.json"), "utf8")).toContain(
      '"status": "fail"',
    );
  });

  test("uses deterministic workspace and agent seams while retaining evidence", async () => {
    const calls: string[] = [];
    const root = mkdtempSync(join(tmpdir(), "sssf-source-test-"));
    roots.push(root);
    const { run } = setup({
      sourceRoot: root,
      workspaceRoot: join(root, "workspaces"),
      workspaceAdapter: fakeWorkspace(root, calls),
      agent: new InMemoryAgent([agentResult]),
    });

    run.prepareWorkspace();
    await run.phase(
      { name: "invoke", kind: "agent", owner: "fake", description: "Persists an invocation." },
      async (phase) => {
        await phase.call(new AgentCall("GenericOutput", "artifact"));
      },
    );

    expect(calls).toEqual([`clone:${join(root, "workspaces", "test-run")}`]);
    expect(run.repoRoot).toBe(join(root, "workspaces", "test-run"));
    expect(readFileSync(join(run.runEvidenceDir, "workspace.txt"), "utf8")).toBe(
      `${join(root, "workspaces", "test-run")}\n`,
    );
    expect(run.finish()).toBe(0);
  });
});

test("rejects a changed source when finishing", () => {
  const calls: string[] = [];
  let state: "Clean" | "Dirty" = "Clean";
  const root = mkdtempSync(join(tmpdir(), "sssf-source-integrity-test-"));
  roots.push(root);
  const adapter = fakeWorkspace(root, calls);
  adapter.inspectSource = () => ({ revision: "revision-1", workingTree: state });
  const { run } = setup({
    sourceRoot: root,
    workspaceRoot: join(root, "workspaces"),
    workspaceAdapter: adapter,
  });
  run.prepareWorkspace();
  state = "Dirty";
  expect(run.finish()).toBe(1);
});

test("cancels a running workflow through the injected timer", async () => {
  let timer: (() => void) | undefined;
  const { run } = setup({
    setTimeout: (handler) => {
      timer = handler;
      return setTimeout(() => undefined, 60_000);
    },
  });
  timer?.();
  await expect(
    run.phase(
      { name: "canceled", kind: "code", owner: "engineer", description: "Rejects canceled work." },
      () => undefined,
    ),
  ).rejects.toThrow("whole-run timeout");
  expect(run.finish()).toBe(1);
});
