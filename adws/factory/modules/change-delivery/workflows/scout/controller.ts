import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";
import type { ScoutRequest } from "./request";

/** Maps the repository without modifying source, producing a gated evidence artifact. */
export const scoutWorkflow: WorkflowDefinition = {
  id: "scout",
  capability: "change-delivery",
  name: "Scout",
  describe: () => ({
    name: "Scout",
    purpose: "Maps the repository without changing source.",
  }),
  controller: async (context: WorkflowContext) => {
    const request: ScoutRequest = {
      prompt: context.request ?? "",
      agentOwner: "scout",
    };
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description:
          "Captures the repository-mapping request before work begins.",
      },
      () => undefined,
    );
    await context.phase(
      {
        name: "scout",
        kind: "agent",
        owner: request.agentOwner,
        description:
          "Finds and reports where things live without changing source.",
      },
      async () => {
        await context.ai("scout-agent", "Scout", request.prompt, {
          outputArtifact: "scout-proposal",
          agentOwner: request.agentOwner,
        });
        await context.gate(
          "scout-artifact-gate",
          "Scout artifact gate",
          request.prompt,
          {
            inputArtifact: "scout-proposal",
          },
        );
      },
    );
  },
};
