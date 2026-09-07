import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";
import type { PlanRequest } from "./request";

/** Turns the request into an implementable plan and verifies its evidence artifact. */
export const planWorkflow: WorkflowDefinition = {
  id: "plan",
  capability: "change-delivery",
  name: "Plan",
  describe: () => ({
    name: "Plan",
    purpose: "Turns the request into an implementable change plan.",
  }),
  controller: async (context: WorkflowContext) => {
    const request: PlanRequest = {
      prompt: context.request ?? "",
      agentOwner: "planner",
    };
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description: "Captures the planning request before work begins.",
      },
      () => undefined,
    );
    await context.phase(
      {
        name: "plan",
        kind: "agent",
        owner: request.agentOwner,
        description:
          "Turns the request into an implementable plan with non-empty evidence.",
      },
      async () => {
        await context.ai("plan-agent", "Plan", request.prompt, {
          outputArtifact: "plan-proposal",
          agentOwner: request.agentOwner,
        });
        await context.gate(
          "plan-artifact-gate",
          "Plan artifact gate",
          request.prompt,
          {
            inputArtifact: "plan-proposal",
          },
        );
      },
    );
  },
};
