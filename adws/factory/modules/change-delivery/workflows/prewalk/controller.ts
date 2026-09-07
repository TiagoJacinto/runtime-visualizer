import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";

/** Plans a change, then pauses at the human gate before implementation continues. */
export const prewalkWorkflow: WorkflowDefinition = {
  id: "prewalk",
  capability: "change-delivery",
  name: "Prewalk",
  describe: () => ({
    name: "Prewalk",
    purpose: "Plans before handing implementation to the builder.",
  }),
  controller: async (context: WorkflowContext) => {
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description: "Captures the request before planning and handoff.",
      },
      () => undefined,
    );
    await context.phase(
      {
        name: "prewalk",
        kind: "agent",
        owner: "planner",
        description:
          "Plans on the strong model and records the bounded implementation handoff.",
      },
      async () => {
        await context.ai("prewalk-agent", "Prewalk", context.request ?? "", {
          outputArtifact: "prewalk-proposal",
          agentOwner: "planner",
        });
      },
    );
    await context.phase(
      {
        name: "review",
        kind: "gate",
        owner: "human",
        description:
          "Waits for an explicit human decision before implementation proceeds.",
      },
      async () => {
        await context.review();
      },
    );
  },
};
