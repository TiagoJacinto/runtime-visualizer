import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";

const approved = (context: WorkflowContext, artifact: string) => {
  const value = context.artifacts.get(artifact)?.value as
    | { approved?: boolean }
    | undefined;
  return value?.approved === true;
};

/** Builds, tests, and revises a change through bounded review before human approval. */
export const buildReviewWorkflow: WorkflowDefinition = {
  id: "build-review",
  capability: "change-delivery",
  name: "Build review",
  changesSource: true,
  describe: () => ({
    name: "Build review",
    purpose: "Checks implementation claims against evidence.",
    changesSource: true,
  }),
  controller: async (context: WorkflowContext) => {
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description: "Captures the implementation request before building.",
      },
      () => undefined,
    );
    await context.phase(
      {
        name: "build",
        kind: "agent",
        owner: "builder",
        description:
          "Implements the requested change and records the builder proposal.",
      },
      async () => {
        await context.ai("build-review-build", "Build", context.request ?? "", {
          outputArtifact: "build-review-build",
          agentOwner: "builder",
        });
      },
    );
    let reviewArtifact = "build-review-review-1";
    for (let attempt = 1; attempt <= 3; attempt++) {
      await context.phase(
        {
          name: `review_${attempt}`,
          kind: "agent",
          owner: "reviewer",
          description:
            "Checks every implementation claim against the recorded evidence.",
        },
        async () => {
          await context.ai(
            `build-review-review-${attempt}`,
            "Review",
            context.request ?? "",
            {
              inputArtifact: "build-review-build",
              outputArtifact: reviewArtifact,
              agentOwner: "reviewer",
            },
          );
          await context.gate(
            `build-review-gate-${attempt}`,
            "Review evidence gate",
            context.request ?? "",
            { inputArtifact: reviewArtifact },
          );
        },
      );
      if (approved(context, reviewArtifact)) break;
      if (attempt < 3) {
        const next = `build-review-revise-${attempt}`;
        await context.phase(
          {
            name: `revise_${attempt}`,
            kind: "agent",
            owner: "builder",
            description:
              "Closes every blocking finding from the reviewer before another bounded review.",
          },
          async () => {
            await context.ai(next, "Revise", context.request ?? "", {
              inputArtifact: reviewArtifact,
              outputArtifact: "build-review-build",
              agentOwner: "builder",
            });
          },
        );
        reviewArtifact = `build-review-review-${attempt + 1}`;
      }
    }
    await context.phase(
      {
        name: "review",
        kind: "gate",
        owner: "human",
        description:
          "Waits for an explicit human decision on the reviewed implementation.",
      },
      async () => {
        await context.review();
      },
    );
  },
};
