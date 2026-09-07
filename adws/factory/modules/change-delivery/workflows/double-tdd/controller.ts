import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";

const states = [
  "S0_SCOPE",
  "S1_SELECT_OUTER",
  "S2_WRITE_OUTER",
  "S3_FOCUSED_OUTER",
  "S4_SELECT_INNER",
  "S5_INNER_RED",
  "S6_INNER_GREEN",
  "S7_UNIT_SUITE",
  "S9_FULL_ACCEPTANCE",
  "S10_COVERAGE",
] as const;

/** Coordinates the bounded acceptance/unit proof loop and submits it for review. */
export const doubleTddWorkflow: WorkflowDefinition = {
  id: "double-tdd",
  capability: "change-delivery",
  name: "Double TDD",
  changesSource: true,
  describe: () => ({
    name: "Double TDD",
    purpose: "Coordinates acceptance and unit proof for a change.",
    changesSource: true,
  }),
  controller: async (context: WorkflowContext) => {
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description:
          "Captures the acceptance target before the double-TDD state loop.",
      },
      () => undefined,
    );
    let previous = "";
    for (const state of states) {
      await context.phase(
        {
          name: state.toLowerCase(),
          kind:
            state.includes("FOCUSED") ||
            state.includes("SUITE") ||
            state.includes("ACCEPTANCE") ||
            state.includes("COVERAGE")
              ? "code"
              : "agent",
          owner: state === "S10_COVERAGE" ? "reviewer" : "builder",
          description: `Executes ${state} and records its typed proof before the next state.`,
        },
        async () => {
          const result = await context.ai(
            `double-tdd-${state}`,
            state,
            `${context.request ?? ""}\nPrevious proof: ${previous}`,
            { outputArtifact: `double-tdd-${state}`, agentOwner: "builder" },
          );
          previous = JSON.stringify(result.output ?? {});
          if (
            state.includes("FOCUSED") ||
            state.includes("SUITE") ||
            state.includes("ACCEPTANCE")
          ) {
            const command = await context.command({
              command: "bun",
              args: ["run", "test"],
              cwd: context.workspacePath,
            });
            if (command.failure || command.exitCode !== 0)
              throw new Error(`${state} proof failed`);
          }
        },
      );
    }
    await context.phase(
      {
        name: "review",
        kind: "gate",
        owner: "human",
        description:
          "Waits for an explicit human decision on the completed acceptance and unit proof.",
      },
      async () => {
        await context.review();
      },
    );
  },
};
