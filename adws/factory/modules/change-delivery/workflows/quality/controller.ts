import type {
  WorkflowContext,
  WorkflowDefinition,
} from "../../../workflow-execution";
import type { QualityRequest } from "./request";

const checks = [
  ["test", ["run", "test"]],
  ["lint", ["run", "lint"]],
  ["typecheck", ["run", "typecheck"]],
  ["build", ["run", "build"]],
] as const;

/** Runs the configured deterministic quality checks in the Factory workspace. */
export const qualityWorkflow: WorkflowDefinition = {
  id: "quality",
  capability: "change-delivery",
  name: "Quality",
  changesSource: true,
  describe: () => ({
    name: "Quality",
    purpose: "Runs deterministic validation and reports failures.",
    changesSource: true,
  }),
  controller: async (context: WorkflowContext) => {
    const request: QualityRequest = {
      prompt: context.request ?? "",
      sourceRepository: context.workspacePath,
      expectedSourceRevision: undefined,
    };
    await context.phase(
      {
        name: "request",
        kind: "engineer",
        owner: "engineer",
        description: "Captures the quality request before checks run.",
      },
      () => undefined,
    );
    await context.phase(
      {
        name: "quality",
        kind: "code",
        owner: "reviewer",
        description:
          "Runs deterministic test, lint, typecheck, and build commands in the disposable workspace.",
      },
      async () => {
        for (const [name, args] of checks) {
          const result = await context.command({
            command: "bun",
            args,
            cwd: context.workspacePath,
          });
          if (result.failure || result.exitCode !== 0)
            throw new Error(
              `${name} failed: ${result.stderr || result.stdout}`,
            );
        }
      },
    );
    void request;
  },
};
