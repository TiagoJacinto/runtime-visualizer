import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";

/** Implements a requested change in an isolated workspace and awaits human review. */
export const buildWorkflow: WorkflowDefinition = {
  id: "build",
  capability: "change-delivery",
  name: "Build",
  changesSource: true,
  describe: () => ({
    name: "Build",
    purpose: "Implements the requested change in a disposable workspace.",
    changesSource: true,
  }),
  controller: async (context: WorkflowContext) => {
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description: "Captures the requested change before implementation.",
      },
      () => undefined,
    );
    await context.phase(
      {
        name: "build",
        kind: "agent",
        owner: "builder",
        description:
          "Implements the requested change and records changed-file evidence.",
      },
      async () => {
        await context.ai("build-agent", "Build", context.request ?? "", {
          outputArtifact: "build-proposal",
          agentOwner: "builder",
        });
      },
    );
    await context.phase(
      {
        name: "review",
        kind: "gate",
        owner: "human",
        description:
          "Waits for an explicit human decision on the implementation.",
      },
      async () => {
        await context.review();
      },
    );
  },
};
