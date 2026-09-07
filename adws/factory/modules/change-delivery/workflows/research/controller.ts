import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";
import { compileWorkflowSkill } from "../../adapters/workflow-skills/project_skills";
import type { ResearchRequest } from "./request";

function problemFolder(context: WorkflowContext): string {
  const folder = context.problemFolder?.trim();
  if (!folder)
    throw new Error("--problem-folder is required for RPI workflows");
  return folder;
}

/** Runs the research-question and research phases with explicit artifact handoff. */
export const researchWorkflow: WorkflowDefinition = {
  id: "research",
  capability: "change-delivery",
  name: "Research",
  changesSource: false,
  describe: () => ({
    name: "Research",
    purpose: "Collects scoped evidence for the requested question.",
  }),
  controller: async (context) => {
    const request: ResearchRequest = {
      prompt: context.request ?? "",
      sourceRepository: undefined,
    };
    const folder = problemFolder(context);
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description: "Captures the research request before scoping evidence.",
      },
      () => undefined,
    );
    const questionsSkill = compileWorkflowSkill(
      "rpi-create-research-questions",
      { problemFolder: folder },
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
          "research-questions-agent",
          questionsSkill,
          request.prompt,
          {
            outputArtifact: "research-questions",
            agentOwner: "research_questions",
          },
        );
        await context.gate(
          "research-questions-artifact-gate",
          "Verifies the research questions artifact is present and non-empty.",
          request.prompt,
          { inputArtifact: "research-questions" },
        );
      },
    );
    const researchSkill = compileWorkflowSkill(
      "rpi-create-research",
      {
        problemFolder: folder,
        researchQuestionsArtifact: "research-questions",
      },
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
        await context.ai("research-agent", researchSkill, request.prompt, {
          inputArtifact: "research-questions",
          outputArtifact: "research",
          agentOwner: "research",
        });
        await context.gate(
          "research-artifact-gate",
          "Verifies the research document artifact is present and non-empty.",
          request.prompt,
          { inputArtifact: "research" },
        );
      },
    );
  },
};
