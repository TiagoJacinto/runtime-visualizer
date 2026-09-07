import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import * as pi from "../pi-agent/agent_pi";
import * as opencode from "../opencode-agent/agent_opencode";
import type { AgentRuntime } from "../pi-agent/agent_runtime";

export interface ConfigDefaults {
  coding_agent: string;
  model: string;
  thinking: string;
  color: string;
  tools: string[] | null;
  protected_files: string[];
  data_dir: string;
  allowed_env: string[];
  harness_timeout_seconds: number;
  run_timeout_seconds: number;
  max_output_bytes: number;
}
export interface AgentConfig {
  name: string;
  coding_agent: string;
  model: string;
  thinking: string;
  prewalk?: { implementation_model: string; implementation_thinking: string };
  color: string;
  purpose: string;
  prompt_engineering: { system: string; user: string };
  tools: string[] | null;
  writes: string[] | null;
  allowed_env: string[];
}
export interface SSSFConfig {
  defaults: ConfigDefaults;
  observability: { db: string; poll_ms: number };
  agents: AgentConfig[];
}
export function resolveRuntimePath(value: string) {
  return resolvePath(process.cwd(), value);
}
export function loadConfig(
  path = "adws/adw_sssf_config/sssf.config.yaml",
): SSSFConfig {
  const text = readFileSync(path, "utf8");
  let raw: any;
  try {
    raw =
      (typeof Bun !== "undefined" ? Bun.YAML.parse(text) : JSON.parse(text)) ||
      {};
  } catch (error) {
    throw new Error(
      `Cannot parse agent configuration ${path}: ${String(error)}`,
    );
  }
  const d = raw.defaults || {};
  const defaults: ConfigDefaults = {
    coding_agent: d.coding_agent || "pi",
    model: d.model || "openrouter/google/gemini-3.6-flash",
    thinking: d.thinking || "medium",
    color: d.color || "",
    tools: d.tools ?? null,
    protected_files: d.protected_files || [
      "adws/factory/",
      "adws/adw_sssf_config/",
      "adws/run.ts",
    ],
    data_dir: d.data_dir || "adws/adw_data",
    allowed_env: d.allowed_env || [],
    harness_timeout_seconds: Number(d.harness_timeout_seconds || 600),
    run_timeout_seconds: Number(d.run_timeout_seconds || 3600),
    max_output_bytes: Number(d.max_output_bytes || 1_000_000),
  };
  const agents = (raw.agents || []).map((a: any) => ({
    ...a,
    prompt_engineering: {
      system: resolveRuntimePath(a.prompt_engineering.system),
      user: resolveRuntimePath(a.prompt_engineering.user),
    },
    coding_agent: a.coding_agent ?? defaults.coding_agent,
    model: a.model ?? defaults.model,
    thinking: a.thinking ?? defaults.thinking,
    prewalk: a.prewalk
      ? {
          implementation_model: a.prewalk.implementation_model,
          implementation_thinking:
            a.prewalk.implementation_thinking ?? defaults.thinking,
        }
      : undefined,
    color: a.color ?? defaults.color,
    tools: a.tools ?? defaults.tools,
    writes: a.writes === undefined ? null : a.writes,
    allowed_env: a.allowed_env ?? defaults.allowed_env,
  }));
  return {
    defaults,
    observability: {
      db: raw.observability?.db || "adws/adw_data/sssf.db",
      poll_ms: raw.observability?.poll_ms || 500,
    },
    agents,
  };
}
export function resolveAgent(cfg: SSSFConfig, name: string): AgentConfig {
  const agent = cfg.agents.find((candidate) => candidate.name === name);
  if (!agent)
    throw new Error(
      `agent ${name} is not defined in config — available: ${cfg.agents.map((candidate) => candidate.name).join(", ")}`,
    );
  return agent;
}
export function validate(cfg: SSSFConfig, required: string[]): void {
  const problems: string[] = [];
  for (const name of required) {
    try {
      const agent = resolveAgent(cfg, name);
      if (agent.coding_agent !== "pi" && agent.coding_agent !== "opencode")
        problems.push(
          `agent ${name}: unsupported coding_agent ${agent.coding_agent}`,
        );
      for (const path of [
        agent.prompt_engineering.system,
        agent.prompt_engineering.user,
      ])
        if (!existsSync(path))
          problems.push(`agent ${name}: prompt not found: ${path}`);
      const runtime: AgentRuntime =
        agent.coding_agent === "opencode" ? opencode.runtime : pi.runtime;
      runtime.assertCredential(runtime.resolveModel(agent.model)[0]);
    } catch (error) {
      problems.push(String(error));
    }
  }
  if (problems.length)
    throw new Error(`config validation failed:\n- ${problems.join("\n- ")}`);
}
