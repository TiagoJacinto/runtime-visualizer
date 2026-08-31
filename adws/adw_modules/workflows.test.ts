import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { compileWorkflowSkill } from "./project_skills";
import { compileSkill } from "./skill_compiler";
import { InMemoryAgent } from "./agent";
import { Run, type RunConsole } from "./runner";
import type { SSSFConfig } from "./data_types";
import { prdOrientedDiscovery } from "./workflows";

const canonicalSkill = `# Research

<!-- @if target=project -->
Find the questions artifact.
<!-- @endif -->

<!-- @if target=workflow -->
Read {{researchQuestionsArtifact}}.
<!-- @endif -->
`;

test("compiles project and workflow skill variants", () => {
  expect(compileSkill(canonicalSkill, { target: "project" })).toContain(
    "Find the questions artifact.",
  );
  expect(compileSkill(canonicalSkill, { target: "project" })).not.toContain("Read {{");
  expect(
    compileSkill(canonicalSkill, {
      target: "workflow",
      variables: { researchQuestionsArtifact: ".rpi/problems/auth/01-questions.md" },
    }),
  ).toContain("Read .rpi/problems/auth/01-questions.md.");
});

test("loads and compiles a workflow skill with runtime values", () => {
  const root = mkdtempSync(join(tmpdir(), "sssf-skill-"));
  try {
    const skill = join(root, "adws/adw_data/workflow_skills/rpi-create-research/SKILL.md");
    mkdirSync(dirname(skill), { recursive: true });
    writeFileSync(skill, canonicalSkill);

    expect(
      compileWorkflowSkill(
        "rpi-create-research",
        { researchQuestionsArtifact: ".rpi/problems/auth/01-questions.md" },
        root,
      ),
    ).toContain("Read .rpi/problems/auth/01-questions.md.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const roots: string[] = [];
const silentConsole: RunConsole = {
  sessionStarted: () => undefined,
  note: () => undefined,
  phaseStarted: () => undefined,
  phaseEnded: () => undefined,
  sessionFinished: () => undefined,
};

function setupWorkflow() {
  const root = mkdtempSync(join(tmpdir(), "sssf-workflow-"));
  roots.push(root);
  for (const name of [
    "rpi-create-research-questions",
    "rpi-create-research",
    "rpi-create-prd",
    "rpi-create-tdd",
  ]) {
    const skill = join(root, "adws/adw_data/workflow_skills", name, "SKILL.md");
    mkdirSync(dirname(skill), { recursive: true });
    writeFileSync(skill, "Complete the requested workflow step.");
  }

  const cfg = {
    defaults: { data_dir: join(root, "data"), run_timeout_seconds: 30 },
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
  return {
    root,
    run: (agent: InMemoryAgent) =>
      new Run(cfg, "workflow-test", tracer, "test-engineer", {
        sourceRoot: root,
        agent,
        console: silentConsole,
      }),
  };
}

const response = (artifact: string) => ({
  status: "success" as const,
  summary: "created",
  artifacts: [artifact],
});

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("prdOrientedDiscovery", () => {
  test("orders phases and passes artifacts through an in-memory agent", async () => {
    const setup = setupWorkflow();
    const artifacts = ["questions.md", "research.md", "prd.md", "tdd.md"].map((name) => {
      const path = join(setup.root, name);
      writeFileSync(path, name);
      return path;
    });
    const agent = new InMemoryAgent(artifacts.map(response));
    const run = setup.run(agent);

    await expect(
      prdOrientedDiscovery({
        config: "unused.yaml",
        prompt: "build the workspace",
        problemFolder: ".rpi/problems/workspace",
        run,
      }),
    ).resolves.toBe(0);

    expect(run.phases.map((phase) => phase.params.name)).toEqual([
      "request",
      "research_questions",
      "research",
      "prd",
      "tdd",
    ]);
    expect(agent.messages.map(({ phase }) => phase)).toEqual([
      "research_questions",
      "research",
      "prd",
      "tdd",
    ]);
    expect(agent.messages.map(({ call }) => call.previous?.artifacts)).toEqual([
      undefined,
      [artifacts[0]],
      [artifacts[1]],
      [artifacts[2]],
    ]);
  });

  test("fails before research when the required skill is missing", async () => {
    const setup = setupWorkflow();
    const agent = new InMemoryAgent([]);
    const run = setup.run(agent);
    rmSync(join(setup.root, "adws/adw_data/workflow_skills/rpi-create-research-questions"), {
      recursive: true,
      force: true,
    });

    await expect(
      prdOrientedDiscovery({
        config: "unused.yaml",
        prompt: "build the workspace",
        problemFolder: ".rpi/problems/workspace",
        run,
      }),
    ).rejects.toThrow(/workflow skill|research-questions/);
    expect(run.phases.map((phase) => phase.params.name)).toEqual(["request"]);
    expect(agent.messages).toHaveLength(0);
    run.finish(false, "expected test failure");
  });

  test("stops when an in-memory agent response fails the artifact gate", async () => {
    const setup = setupWorkflow();
    const agent = new InMemoryAgent([{ status: "success", artifacts: [] }]);
    const run = setup.run(agent);

    await expect(
      prdOrientedDiscovery({
        config: "unused.yaml",
        prompt: "build the workspace",
        problemFolder: ".rpi/problems/workspace",
        run,
      }),
    ).rejects.toThrow("did not declare an artifact");
    expect(run.phases.map((phase) => phase.params.name)).toEqual(["request", "research_questions"]);
    expect(agent.messages).toHaveLength(1);
  });
});
