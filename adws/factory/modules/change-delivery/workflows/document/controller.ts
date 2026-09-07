import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";

/** Captures repository changes, documents them, and submits the result for human review. */
export const documentWorkflow: WorkflowDefinition = {
  id: "document",
  capability: "change-delivery",
  name: "Document",
  changesSource: true,
  describe: () => ({
    name: "Document",
    purpose: "Updates documentation with verified repository facts.",
    changesSource: true,
  }),
  controller: async (context: WorkflowContext) => {
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description:
          "Captures the documentation request before reading changes.",
      },
      () => undefined,
    );
    await context.phase(
      {
        name: "changes",
        kind: "code",
        owner: "git",
        description:
          "Captures the disposable workspace diff as command evidence for documentation.",
      },
      async () => {
        const result = await context.command({
          command: "git",
          args: ["diff", "--stat", "HEAD"],
          cwd: context.workspacePath,
        });
        if (result.failure || result.exitCode !== 0)
          throw new Error(`change capture failed: ${result.stderr}`);
        await context.harness(
          "document-change-capture",
          "Capture changes",
          result.stdout,
          {
            outputArtifact: "document-changes",
          },
        );
      },
    );
    await context.phase(
      {
        name: "document",
        kind: "agent",
        owner: "documenter",
        description:
          "Turns the captured change artifact into a verified documentation proposal.",
      },
      async () => {
        await context.ai("document-agent", "Document", context.request ?? "", {
          inputArtifact: "document-changes",
          outputArtifact: "document-proposal",
          agentOwner: "documenter",
        });
        await context.gate(
          "document-artifact-gate",
          "Document artifact gate",
          context.request ?? "",
          { inputArtifact: "document-proposal" },
        );
      },
    );
    await context.phase(
      {
        name: "review",
        kind: "gate",
        owner: "human",
        description:
          "Waits for an explicit human decision on the documentation.",
      },
      async () => {
        await context.review();
      },
    );
  },
};
