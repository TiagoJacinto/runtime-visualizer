import { describe, expect, test } from "vitest";
import { changeDeliveryWorkflows, getChangeDeliveryWorkflow } from "..";
import { Factory } from "../../workflow-execution";

const expectedIds = [
  "prompt",
  "scout",
  "plan",
  "prewalk",
  "build",
  "quality",
  "build-review",
  "double-tdd",
  "document",
  "research",
  "prd-oriented-design",
  "prd-oriented-discovery",
];

describe("change-delivery workflow registry", () => {
  test("registers every supported workflow exactly once", () => {
    expect(changeDeliveryWorkflows.map((workflow) => workflow.id)).toEqual(
      expectedIds,
    );
    expect(
      new Set(changeDeliveryWorkflows.map((workflow) => workflow.id)).size,
    ).toBe(expectedIds.length);
  });

  test("executes prompt through the canonical Factory with a deterministic agent", async () => {
    const run = await new Factory(changeDeliveryWorkflows, {
      ai: async ({ input, options }) => ({
        value: { status: "success", input, owner: options?.agentOwner },
      }),
    }).execute({
      workflowId: "prompt",
      request: "capture this",
      agentOwner: "scout",
    });
    expect(run.status).toBe("Succeeded");
    expect(run.phases.map((phase) => phase.name)).toEqual([
      "request",
      "prompt",
    ]);
    expect(run.invocations.at(-1)?.output).toEqual({
      value: { status: "success", input: "capture this", owner: "scout" },
    });
  });

  test("records an explicit human decision for build review", async () => {
    const run = await new Factory(changeDeliveryWorkflows, {
      ai: async ({ input }) => ({ value: { status: "success", input } }),
      workspace: {
        inspect: (repository) => ({
          repository,
          revision: "revision",
          workingTree: "Clean",
        }),
        create: (repository, destination, expectedRevision) => ({
          path: destination,
          source: {
            repository,
            revision: expectedRevision,
            workingTree: "Clean",
          },
          isolation: "IndependentClone" as const,
          retain: () => undefined,
          dispose: () => undefined,
        }),
      },
      humanGate: {
        awaitDecision: async () => ({
          outcome: "Accepted",
          decidedAt: "2026-01-01T00:00:00.000Z",
          decidedBy: "test-reviewer",
        }),
      },
    }).execute({
      workflowId: "build",
      request: "make the change",
      sourceRepository: "/tmp/source",
      expectedSourceRevision: "revision",
    });
    expect(run.integration?.outcome).toBe("Accepted");
    expect(run.status).toBe("Succeeded");
    expect(
      run.evidenceManifest.artifacts.some((entry) => entry.kind === "review"),
    ).toBe(true);
  });

  test("executes the RPI discovery graph with typed artifact handoffs", async () => {
    const run = await new Factory(changeDeliveryWorkflows, {
      ai: async ({ options }) => ({
        value: { status: "success", owner: options?.agentOwner },
      }),
    }).execute({
      workflowId: "prd-oriented-discovery",
      request: "design authentication",
      problemFolder: ".rpi/problems/auth",
    });
    expect(run.status).toBe("Succeeded");
    expect(run.phases.map((phase) => phase.name)).toEqual([
      "request",
      "research_questions",
      "research",
      "prd",
      "tdd",
    ]);
    expect([...run.context.artifacts.keys()]).toEqual([
      "research-questions",
      "research",
      "prd",
      "tdd",
    ]);
    expect(
      run.invocations.filter(
        (invocation) => invocation.primitiveType === "Gate",
      ),
    ).toHaveLength(4);
    expect(
      run.invocations
        .filter((invocation) => invocation.primitiveType === "AI")
        .map((invocation) => invocation.output),
    ).toContainEqual({
      value: { status: "success", owner: "research_questions" },
    });
  });

  test("rejects RPI execution without a problem folder", async () => {
    const run = await new Factory(changeDeliveryWorkflows, {
      ai: async () => ({ value: "unused" }),
    }).execute({
      workflowId: "research",
      request: "investigate this",
    });
    expect(run.status).toBe("Failed");
    expect(run.failure).toContain("--problem-folder is required");
  });

  test("resolves workflows from their local modules", () => {
    for (const id of expectedIds)
      expect(getChangeDeliveryWorkflow(id).id).toBe(id);
  });
});
