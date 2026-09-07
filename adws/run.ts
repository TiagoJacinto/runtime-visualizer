import { Factory } from "./factory/modules/workflow-execution";
import { changeDeliveryWorkflows } from "./factory/modules/change-delivery";
import { ConfiguredAgentRuntime } from "./factory/modules/change-delivery/configured-agent-runtime";
import { SqliteTraceSink } from "./factory/modules/workflow-execution/trace-runtime";

/** Executes a registered workflow from installed-style command arguments. */
export async function runWorkflowCli(
  workflowId: string,
  argv: readonly string[],
): Promise<number> {
  const args = [...argv];
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const optionsWithValues = new Set([
    "--agent",
    "--revision",
    "--problem-folder",
    "--config",
    "--adw-id",
  ]);
  const request = args
    .filter(
      (arg, index) =>
        !arg.startsWith("--") && !optionsWithValues.has(args[index - 1] ?? ""),
    )
    .join(" ");
  const workflow = changeDeliveryWorkflows.find(
    (candidate) => candidate.id === workflowId,
  );
  if (!workflow || !request) return 2;
  const run = await new Factory(changeDeliveryWorkflows, {
    agentRuntime: new ConfiguredAgentRuntime(
      option("--config") ??
        process.env.SSSF_CONFIG ??
        "adws/adw_sssf_config/sssf.config.yaml",
    ),
    traceSink: new SqliteTraceSink(
      process.env.SSSF_DB ?? "adws/adw_data/sssf.db",
    ),
  }).execute({
    workflowId,
    request,
    agentOwner: option("--agent"),
    problemFolder: option("--problem-folder"),
    ...(option("--revision")
      ? { expectedSourceRevision: option("--revision") }
      : {}),
    ...(workflow.changesSource ? { sourceRepository: process.cwd() } : {}),
  });
  if (run.status !== "Succeeded") {
    console.error(run.failure ?? `${workflowId} failed`);
    return 1;
  }
  console.log(run.runIdentifier);
  return 0;
}

if (import.meta.main) {
  const workflowId = Bun.argv[2];
  if (!workflowId) process.exit(2);
  process.exitCode = await runWorkflowCli(workflowId, Bun.argv.slice(3));
}
