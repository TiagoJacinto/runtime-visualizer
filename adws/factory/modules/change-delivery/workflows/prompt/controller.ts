import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";
import type { PromptRequest } from "./request";

/** Delivers one bounded request to the selected configured agent. */
export const promptWorkflow: WorkflowDefinition = {
  id: "prompt",
  capability: "change-delivery",
  name: "Prompt",
  changesSource: false,
  describe: () => ({
    name: "Prompt",
    purpose: "Sends a bounded request to the selected agent.",
    changesSource: false,
  }),
  controller: async (context: WorkflowContext) => {
    const request: PromptRequest = {
      prompt: context.request ?? "",
      agentOwner: context.agentOwner ?? "engineer",
    };
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description:
          "Captures the operator request before sending it to the selected agent.",
      },
      () => undefined,
    );
    await context.phase(
      {
        name: "prompt",
        kind: "agent",
        owner: request.agentOwner,
        description:
          "Sends the bounded request to the selected agent and records its response.",
      },
      async () => {
        await context.ai("prompt-agent", "Prompt", request.prompt, {
          outputArtifact: "prompt-proposal",
          agentOwner: request.agentOwner,
        });
      },
    );
  },
};
