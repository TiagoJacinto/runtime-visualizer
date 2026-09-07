import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRuntimePort } from "../../../workflow-execution/ports/agent-runtime";
import type { PrimitiveInvocationArguments } from "../../../workflow-execution/domain/workflow";
import { loadConfig, resolveAgent } from "./config";
import * as pi from "../pi-agent/agent_pi";
import * as opencode from "../opencode-agent/agent_opencode";
import { render } from "../pi-agent/prompts";
import type { AgentRuntime } from "../pi-agent/agent_runtime";
import { enforce, snapshot } from "../../../workflow-execution/process-runtime";

type InvokeInput = PrimitiveInvocationArguments & {
  readonly workspacePath?: string;
  readonly inputArtifact?: { readonly id: string; readonly value: unknown };
  readonly signal: AbortSignal;
};
type Agent = ReturnType<typeof resolveAgent>;
type RuntimeSet = {
  readonly pi: AgentRuntime;
  readonly opencode: AgentRuntime;
};
type InvocationContext = {
  readonly input: InvokeInput;
  readonly owner: string;
  readonly agent: Agent;
  readonly runtime: AgentRuntime;
  readonly sessionId: string;
  readonly sessionDir: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  todoSeen: boolean;
  handedOff: boolean;
  activeModel: string;
  activeThinking: string;
  correction: string;
};

function makeContext(
  input: InvokeInput,
  config: ReturnType<typeof loadConfig>,
  runtimes: RuntimeSet,
  sessions: Map<string, string>,
): InvocationContext {
  const owner = input.options?.agentOwner ?? "engineer";
  const agent = resolveAgent(config, owner);
  const runtime =
    agent.coding_agent === "opencode" ? runtimes.opencode : runtimes.pi;
  const key = `${input.runIdentifier ?? "run"}:${owner}`;
  const sessionId =
    sessions.get(key) ??
    `factory-${input.runIdentifier ?? input.invocationId}-${owner}`;
  sessions.set(key, sessionId);
  const sessionDir = join(
    config.defaults.data_dir,
    "agent-sessions",
    String(input.runIdentifier ?? "run"),
    owner,
  );
  mkdirSync(sessionDir, { recursive: true });
  const artifact = input.inputArtifact
    ? `\nPrevious handoff (${input.inputArtifact.id}):\n${JSON.stringify(input.inputArtifact.value, null, 2)}`
    : "";
  const prompt = `${input.input}${artifact}`;
  const systemPrompt = existsSync(agent.prompt_engineering.system)
    ? readFileSync(agent.prompt_engineering.system, "utf8")
    : "";
  const userPrompt = existsSync(agent.prompt_engineering.user)
    ? render(agent.prompt_engineering.user, { prompt })
    : prompt;
  return {
    input,
    owner,
    agent,
    runtime,
    sessionId,
    sessionDir,
    systemPrompt,
    userPrompt,
    todoSeen: !(agent.tools?.includes("todo") ?? false),
    handedOff: false,
    activeModel: agent.model,
    activeThinking: agent.thinking,
    correction: "",
  };
}

function toolsFor(context: InvocationContext): string[] | null {
  const { agent } = context;
  if (
    agent.prewalk &&
    context.activeModel === agent.model &&
    !context.handedOff &&
    agent.tools
  ) {
    return agent.tools.filter((tool) => tool !== "bash");
  }
  return agent.tools;
}

function stopWhenFor(
  context: InvocationContext,
): ((event: any) => boolean) | undefined {
  if (!context.agent.prewalk || context.handedOff) return undefined;
  return (event: any) => {
    if (event?.toolName === "todo") context.todoSeen = true;
    if (
      context.todoSeen &&
      (event?.toolName === "edit" || event?.toolName === "write")
    ) {
      context.handedOff = true;
      return true;
    }
    return false;
  };
}

async function runAttempt(
  context: InvocationContext,
  config: ReturnType<typeof loadConfig>,
  attempt: number,
): Promise<{
  text: string;
  returncode: number;
  before: ReturnType<typeof snapshot> | undefined;
}> {
  const { input, agent } = context;
  const before = input.workspacePath
    ? snapshot({ repoRoot: input.workspacePath })
    : undefined;
  const result = await context.runtime.run({
    prompt: context.correction || context.userPrompt,
    systemPrompt: context.systemPrompt,
    model: context.activeModel,
    thinking: context.activeThinking,
    sessionId: context.sessionId,
    sessionDir: context.sessionDir,
    rawOutputPath: join(
      context.sessionDir,
      `${input.invocationId}-${attempt}.json`,
    ),
    stderrPath: join(
      context.sessionDir,
      `${input.invocationId}-${attempt}.stderr`,
    ),
    tools: toolsFor(context),
    cwd: input.workspacePath ?? process.cwd(),
    allowedEnv: agent.allowed_env,
    timeoutMs: config.defaults.harness_timeout_seconds * 1000,
    maxOutputBytes: config.defaults.max_output_bytes,
    signal: input.signal,
    stopWhen: stopWhenFor(context),
  });
  return { text: result.text, returncode: result.returncode, before };
}

function continueAfterHandoff(context: InvocationContext): boolean {
  if (
    !context.handedOff ||
    !context.agent.prewalk ||
    context.activeModel !== context.agent.model
  ) {
    return false;
  }
  context.activeModel = context.agent.prewalk.implementation_model;
  context.activeThinking = context.agent.prewalk.implementation_thinking;
  context.correction = "Continue implementation after the planning handoff.";
  context.handedOff = false;
  return true;
}

function parseResult(
  context: InvocationContext,
  text: string,
): any | undefined {
  let value: any;
  try {
    value = JSON.parse(text);
  } catch {
    context.correction = `Return only a valid JSON envelope with status success or fail. Previous output was malformed:\n${text}`;
    return undefined;
  }
  if (value?.status !== "success" && value?.status !== "fail") {
    context.correction = "Return a valid envelope with status success or fail.";
    return undefined;
  }
  if (value.status === "fail") {
    context.correction = `Correct the failure and return a success or fail envelope. Previous result: ${JSON.stringify(value)}`;
    return undefined;
  }
  return value;
}

/** Configured agent adapter preserving run-scoped sessions, handoffs, and corrections. */
export class ConfiguredAgentRuntime implements AgentRuntimePort {
  private readonly config: ReturnType<typeof loadConfig>;
  private readonly sessions = new Map<string, string>();
  private readonly runtimes: RuntimeSet;
  constructor(
    configPath = "adws/adw_sssf_config/sssf.config.yaml",
    runtimes = { pi: pi.runtime, opencode: opencode.runtime },
  ) {
    this.config = loadConfig(configPath);
    this.runtimes = runtimes;
  }

  async invoke(input: InvokeInput): Promise<unknown> {
    const context = makeContext(
      input,
      this.config,
      this.runtimes,
      this.sessions,
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await runAttempt(context, this.config, attempt);
      if (continueAfterHandoff(context)) {
        attempt -= 1;
        continue;
      }
      const value = parseResult(context, result.text);
      if (value === undefined) continue;
      if (result.before && input.workspacePath) {
        enforce(
          {
            repoRoot: input.workspacePath,
            cfg: { defaults: this.config.defaults },
          },
          result.before,
          context.agent,
          value,
        );
      }
      return {
        value,
        sessionId: context.sessionId,
        returncode: result.returncode,
      };
    }
    throw new Error(
      `agent ${context.owner} did not return a valid envelope after retries`,
    );
  }
}
