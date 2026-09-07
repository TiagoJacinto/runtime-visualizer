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

/** Composes research and design in the documented RPI discovery order. */
export const prdOrientedDiscoveryWorkflow: WorkflowDefinition = {
  id: "prd-oriented-discovery",
  capability: "change-delivery",
  name: "PRD-oriented discovery",
  changesSource: false,
  describe: () => ({
    name: "PRD-oriented discovery",
    purpose: "Discovers product constraints before design.",
  }),
  controller: async (context) => {
    const problemFolder = folder(context);
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description:
          "Captures the discovery request before researching constraints.",
      },
      () => undefined,
    );
    const questionsSkill = compileWorkflowSkill(
      "rpi-create-research-questions",
      { problemFolder },
      context.workspacePath ?? process.cwd(),
    );
    await context.phase(
      {
        name: "research_questions",
        kind: "agent",
        owner: "research_questions",
        description:
          "Turns the request into evidence-backed questions that scope the research.",
      },
      async () => {
        await context.ai(
          "discovery-research-questions-agent",
          questionsSkill,
          context.request ?? "",
          {
            outputArtifact: "research-questions",
            agentOwner: "research_questions",
          },
        );
        await context.gate(
          "discovery-questions-gate",
          "Verifies the research questions artifact is present and non-empty.",
          context.request ?? "",
          { inputArtifact: "research-questions" },
        );
      },
    );
    const researchSkill = compileWorkflowSkill(
      "rpi-create-research",
      { problemFolder, researchQuestionsArtifact: "research-questions" },
      context.workspacePath ?? process.cwd(),
    );
    await context.phase(
      {
        name: "research",
        kind: "agent",
        owner: "research",
        description:
          "Answers the generated questions with a read-only codebase research document.",
      },
      async () => {
        await context.ai(
          "discovery-research-agent",
          researchSkill,
          context.request ?? "",
          {
            inputArtifact: "research-questions",
            outputArtifact: "research",
            agentOwner: "research",
          },
        );
        await context.gate(
          "discovery-research-gate",
          "Verifies the research document artifact is present and non-empty.",
          context.request ?? "",
          { inputArtifact: "research" },
        );
      },
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
        await context.ai(
          "discovery-prd-agent",
          prdSkill,
          context.request ?? "",
          {
            inputArtifact: "research",
            outputArtifact: "prd",
            agentOwner: "prd",
          },
        );
        await context.gate(
          "discovery-prd-gate",
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
        await context.ai(
          "discovery-tdd-agent",
          tddSkill,
          context.request ?? "",
          {
            inputArtifact: "prd",
            outputArtifact: "tdd",
            agentOwner: "tdd",
          },
        );
        await context.gate(
          "discovery-tdd-gate",
          "Verifies the technical design artifact is present and non-empty.",
          context.request ?? "",
          { inputArtifact: "tdd" },
        );
      },
    );
  },
};
