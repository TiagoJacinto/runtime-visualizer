import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { Factory, type WorkflowDefinition } from "../index";
import { DeterministicTraceSink, SqliteTraceSink } from "../trace-runtime";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) execFileSync("rm", ["-rf", root]);
});

function repo() {
  const path = mkdtempSync(join(tmpdir(), "factory-source-"));
  roots.push(path);
  execFileSync("git", ["init", "--quiet", path]);
  execFileSync("git", ["-C", path, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", path, "config", "user.name", "Test"]);
  writeFileSync(join(path, "README.md"), "before\n");
  execFileSync("git", ["-C", path, "add", "."]);
  execFileSync("git", ["-C", path, "commit", "--quiet", "-m", "initial"]);
  return {
    path,
    revision: execFileSync("git", ["-C", path, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
  };
}

const workflow = (
  controller: WorkflowDefinition["controller"],
  changesSource = true,
): WorkflowDefinition => ({
  id: "change",
  capability: "change-delivery",
  name: "Change",
  changesSource,
  controller,
});

describe("canonical workflow execution", () => {
  test("persists and projects ordered events in SQLite", () => {
    const root = mkdtempSync(join(tmpdir(), "factory-trace-"));
    roots.push(root);
    const sink = new SqliteTraceSink(join(root, "trace.db"));
    sink.record({ runIdentifier: "run-1", type: "phase_start", name: "first" });
    sink.record({ runIdentifier: "run-1", type: "phase_end", name: "first" });
    sink.record({ runIdentifier: "run-2", type: "phase_start", name: "other" });
    expect(sink.project("run-1").map((event) => event.type)).toEqual([
      "phase_start",
      "phase_end",
    ]);
    expect(
      execFileSync("sqlite3", [join(root, "trace.db"), ".tables"], {
        encoding: "utf8",
      }),
    ).toContain("workflow_trace");
  });
  test("rejects dirty source before any primitive runs", async () => {
    const source = repo();
    writeFileSync(join(source.path, "dirty.txt"), "uncommitted\n");
    let called = false;
    const run = await new Factory([
      workflow(async ({ harness }) => {
        called = true;
        await harness("x", "x", "x");
      }),
    ]).execute({
      workflowId: "change",
      sourceRepository: source.path,
      expectedSourceRevision: source.revision,
    });
    expect(run).toMatchObject({
      status: "Failed",
      failure: "DirtySource",
      sourceIntegrity: "Verified",
    });
    expect(run.invocations).toEqual([]);
    expect(called).toBe(false);
    expect(run.evidenceManifestPath).toBeDefined();
  });

  test("records phases, typed handoff, and an evidence manifest", async () => {
    const source = repo();
    const run = await new Factory(
      [
        workflow(async ({ phase, ai, harness }) => {
          await phase(
            {
              name: "draft",
              kind: "agent",
              owner: "builder",
              description: "Drafts the requested change.",
            },
            async () => {
              await ai("draft", "Draft", "request", {
                outputArtifact: "proposal",
              });
            },
          );
          await phase(
            {
              name: "apply",
              kind: "code",
              owner: "builder",
              description: "Applies the reviewed proposal.",
            },
            async () => {
              await harness("apply", "Apply", "change", {
                inputArtifact: "proposal",
              });
            },
          );
        }),
      ],
      {
        ai: ({ input }) => ({ value: input }),
        harness: ({ workspacePath }) => {
          writeFileSync(join(workspacePath!, "README.md"), "after\n");
          return { value: "changed" };
        },
      },
    ).execute({
      workflowId: "change",
      sourceRepository: source.path,
      expectedSourceRevision: source.revision,
    });
    expect(run.status).toBe("Succeeded");
    expect(run.phases.map((phase) => phase.status)).toEqual([
      "Succeeded",
      "Succeeded",
    ]);
    expect(run.invocations.map(({ primitiveType }) => primitiveType)).toEqual([
      "AI",
      "Harness",
    ]);
    expect(run.context.artifacts.get("proposal")).toMatchObject({
      producerInvocationId: "draft",
      consumerInvocationId: "apply",
    });
    expect(
      JSON.parse(readFileSync(run.evidenceManifestPath!, "utf8")),
    ).toMatchObject({
      workflowId: "change",
      status: "Succeeded",
    });
  });

  test("retains a failed disposable workspace and rejects source mutation", async () => {
    const source = repo();
    const run = await new Factory(
      [
        workflow(async ({ harness }) => {
          await harness("fail", "Fail", "request");
        }),
      ],
      {
        harness: ({ workspacePath }) => {
          writeFileSync(join(workspacePath!, "failure.txt"), "inspect\n");
          return { status: "Failed" };
        },
      },
    ).execute({
      workflowId: "change",
      sourceRepository: source.path,
      expectedSourceRevision: source.revision,
    });
    expect(run).toMatchObject({
      status: "Failed",
      failure: "CommandFailed",
      workspaceDisposition: "Retained",
    });
    expect(readFileSync(join(run.workspacePath!, "failure.txt"), "utf8")).toBe(
      "inspect\n",
    );
  });

  test("inspects and decides a persisted run after Factory restart", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "factory-runs-"));
    roots.push(dataRoot);
    const first = new Factory([workflow(async () => undefined, false)], {
      dataRoot,
      now: () => "2025-01-01T00:00:00.000Z",
    });
    const run = await first.execute({
      workflowId: "change",
      runIdentifier: "restart-run",
    });
    const second = new Factory([], {
      dataRoot,
      now: () => "2025-01-02T00:00:00.000Z",
    });
    expect(second.inspect(run.runIdentifier)).toMatchObject({
      runIdentifier: run.runIdentifier,
      workflowId: "change",
    });
    const decided = second.decide(run.runIdentifier, {
      outcome: "Accepted",
      decidedBy: "operator",
    });
    expect(decided.integration).toMatchObject({
      outcome: "Accepted",
      decidedAt: "2025-01-02T00:00:00.000Z",
    });
    expect(new Factory([], { dataRoot }).inspect(run.runIdentifier)).toEqual(
      decided,
    );
  });

  test("rejects missing and duplicate integration decisions", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "factory-runs-"));
    roots.push(dataRoot);
    const factory = new Factory([workflow(async () => undefined, false)], {
      dataRoot,
    });
    await expect(() =>
      factory.decide("missing", { outcome: "Rejected", decidedBy: "operator" }),
    ).toThrow("Workflow run not found");
    const run = await factory.execute({ workflowId: "change" });
    factory.decide(run.runIdentifier, {
      outcome: "Deferred",
      decidedBy: "operator",
    });
    expect(() =>
      factory.decide(run.runIdentifier, {
        outcome: "Accepted",
        decidedBy: "operator",
      }),
    ).toThrow("already recorded");
  });

  test("bounds invocations and records explicit integration decisions", async () => {
    const trace = new DeterministicTraceSink();
    const factory = new Factory(
      [
        workflow(async ({ ai }) => {
          await ai("one", "One", "one");
          await ai("two", "Two", "two");
        }, false),
      ],
      { traceSink: trace },
    );
    const run = await factory.execute({
      workflowId: "change",
      budget: { maxInvocations: 1 },
    });
    expect(run).toMatchObject({ status: "Failed", failure: "BudgetExhausted" });
    expect(
      trace.project(run.runIdentifier).map((event) => event.type),
    ).toContain("invocation_start");
    const decided = factory.decide(run.runIdentifier, {
      outcome: "Deferred",
      decidedBy: "operator",
      reason: "needs review",
    });
    expect(decided.integration).toMatchObject({
      outcome: "Deferred",
      decidedBy: "operator",
    });
    expect(factory.inspect(run.runIdentifier)).toEqual(decided);
  });
});

test("rejects a source-changing workflow without Git admission", async () => {
  const run = await new Factory([
    workflow(async () => undefined, true),
  ]).execute({
    workflowId: "change",
  });
  expect(run).toMatchObject({ status: "Failed", failure: "NonGitSource" });
});

test("rejects empty required artifacts with the default gate", async () => {
  const run = await new Factory([
    workflow(async ({ ai, gate }) => {
      await ai("produce", "Produce", "", { outputArtifact: "artifact" });
      await gate("required", "Required artifact", "", {
        inputArtifact: "artifact",
      });
    }, false),
  ]).execute({ workflowId: "change" });
  expect(run).toMatchObject({ status: "Failed", failure: "GateRejected" });
});

test("turns a failed gate result into a rejected run", async () => {
  const run = await new Factory(
    [
      workflow(async ({ gate }) => {
        await gate("review", "Review", "claim");
      }, false),
    ],
    { gate: () => ({ passed: false }) },
  ).execute({ workflowId: "change" });
  expect(run).toMatchObject({ status: "Failed", failure: "GateRejected" });
  expect(run.invocations[0]).toMatchObject({
    primitiveType: "Gate",
    status: "Failed",
  });
});
