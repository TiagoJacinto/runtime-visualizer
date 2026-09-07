import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";
import { compileWorkflowSkill } from "../../adapters/workflow-skills/project_skills";

function folder(context: WorkflowContext): string {
  const value = context.problemFolder?.trim();
  if (!value) throw new Error("--problem-folder is required for RPI workflows");
  return value;
}

/** Produces a PRD and technical design from the request and optional research artifact. */
export const prdOrientedDesignWorkflow: WorkflowDefinition = {
  id: "prd-oriented-design",
  capability: "change-delivery",
  name: "PRD-oriented design",
  changesSource: false,
  describe: () => ({
    name: "PRD-oriented design",
    purpose: "Designs a product change from an approved request.",
  }),
  controller: async (context) => {
    const problemFolder = folder(context);
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description:
          "Captures the design request before drafting product requirements.",
      },
      () => undefined,
    );
    const prdSkill = compileWorkflowSkill(
      "rpi-create-prd",
      { problemFolder },
      context.workspacePath ?? process.cwd(),
    );
    await context.phase(
      {
        name: "prd",
        kind: "agent",
        owner: "prd",
        description:
          "Turns the request and research findings into a product requirements document.",
      },
      async () => {
        await context.ai("prd-agent", prdSkill, context.request ?? "", {
          inputArtifact: context.artifacts.has("research")
            ? "research"
            : undefined,
          outputArtifact: "prd",
          agentOwner: "prd",
        });
        await context.gate(
          "prd-artifact-gate",
          "Verifies the product requirements artifact is present and non-empty.",
          context.request ?? "",
          { inputArtifact: "prd" },
        );
      },
    );
    const tddSkill = compileWorkflowSkill(
      "rpi-create-tdd",
      { problemFolder },
      context.workspacePath ?? process.cwd(),
    );
    await context.phase(
      {
        name: "tdd",
        kind: "agent",
        owner: "tdd",
        description:
          "Turns the product requirements into a technical design document.",
      },
      async () => {
        await context.ai("tdd-agent", tddSkill, context.request ?? "", {
          inputArtifact: "prd",
          outputArtifact: "tdd",
          agentOwner: "tdd",
        });
        await context.gate(
          "tdd-artifact-gate",
          "Verifies the technical design artifact is present and non-empty.",
          context.request ?? "",
          { inputArtifact: "tdd" },
        );
      },
    );
  },
};
