import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { AgentCall, AgentConfig, EnvelopeBase, Phase, PiRequest, SSSFConfig } from "./data_types";
import type { Agent } from "./agent";
import * as pi from "./agent_pi";
import * as opencode from "./agent_opencode";
import { AgentRuntime } from "./agent_runtime";
import * as prompts from "./prompts";
import { newId } from "./utils";
import { snapshot, enforce } from "./permissions";

export function resolveRuntimePath(value: string) {
  return resolvePath(process.cwd(), value);
}

export function loadConfig(path = "adws/adw_sssf_config/sssf.config.yaml"): SSSFConfig {
  const raw: any = Bun.YAML.parse(readFileSync(path, "utf8")) || {};
  const d = raw.defaults || {};
  const defaults = {
    coding_agent: d.coding_agent || "pi",
    model: d.model || "openrouter/google/gemini-3.6-flash",
    thinking: d.thinking || "medium",
    color: d.color || "",
    tools: d.tools ?? null,
    protected_files: d.protected_files || [
      "adws/adw_modules/",
      "adws/adw_sssf_config/",
      "adws/adw_*.ts",
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
          implementation_thinking: a.prewalk.implementation_thinking ?? defaults.thinking,
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

export function resolveAgent(cfg: SSSFConfig, name: string) {
  const agent = cfg.agents.find((x) => x.name === name);
  if (!agent)
    throw new Error(
      `agent ${name} is not defined in config — available: ${cfg.agents.map((x) => x.name).join(", ")}`,
    );
  return agent;
}

export function validate(cfg: SSSFConfig, required: string[]) {
  const problems: string[] = [];
  for (const name of required) {
    let agent: AgentConfig;
    try {
      agent = resolveAgent(cfg, name);
    } catch (error) {
      problems.push(String(error));
      continue;
    }
    if (agent.coding_agent !== "pi" && agent.coding_agent !== "opencode")
      problems.push(`agent ${name}: unsupported coding_agent ${agent.coding_agent}`);
    for (const [label, path] of [
      ["system", agent.prompt_engineering.system],
      ["user", agent.prompt_engineering.user],
    ] as const)
      if (!existsSync(path)) problems.push(`agent ${name}: ${label} prompt not found: ${path}`);
    try {
      const runtime: AgentRuntime =
        agent.coding_agent === "opencode" ? opencode.runtime : pi.runtime;
      const [provider] = runtime.resolveModel(agent.model);
      runtime.assertCredential(provider);
      if (agent.prewalk) {
        const [implementationProvider] = runtime.resolveModel(agent.prewalk.implementation_model);
        runtime.assertCredential(implementationProvider);
      }
    } catch (error) {
      problems.push(`agent ${name}: ${error}`);
    }
  }
  if (problems.length) throw new Error(`config validation failed:\n- ${problems.join("\n- ")}`);
}

function sessionId(run: any, agent: AgentConfig) {
  const old = run.agentMap[agent.name];
  if (old?.session_id && old.model === agent.model) return old.session_id;
  const id = newId(12);
  run.saveAgentMap(agent.name, {
    session_id: id,
    agent: agent.name,
    model: agent.model,
  });
  return id;
}

export class ConfiguredAgent implements Agent {
  execute(run: any, phase: Phase, call: AgentCall) {
    return execute(run, phase, call);
  }
}

export async function execute(run: any, phase: Phase, call: AgentCall): Promise<EnvelopeBase> {
  const agent = resolveAgent(run.cfg, phase.params.owner);
  const dir = `${run.sessionDir}/${agent.name}`;
  const sid = sessionId(run, agent);
  const vars = {
    prompt: call.prompt,
    previous_envelope: call.previous ? JSON.stringify(call.previous, null, 2) : "(none)",
    context_handoff_dir: run.contextHandoffDir,
  };
  const system = [prompts.render(agent.prompt_engineering.system, vars), call.systemPromptAppendix]
    .filter(Boolean)
    .join("\n\n");
  const user = prompts.render(agent.prompt_engineering.user, vars);
  prompts.save(`${dir}/prompts`, "system.md", system);
  prompts.save(`${dir}/prompts`, "user.md", user);
  run.tracer.event({
    adw_id: run.adwId,
    phase_id: phase.phaseId,
    type: "agent_start",
    name: agent.name,
    payload: {
      model: agent.model,
      thinking: agent.thinking,
      session_id: sid,
      coding_agent: agent.coding_agent,
      purpose: agent.purpose,
      tools: agent.tools,
    },
  });
  run.console.agentStarted(agent.name, agent.model, sid);
  const before = snapshot(run);
  const attempts = (phase.params.retries || 0) + 1;
  const runtime: AgentRuntime = agent.coding_agent === "opencode" ? opencode.runtime : pi.runtime;
  const tracker = new pi.ToolCallTracker();
  let last: any;
  let correction = "";
  let activeModel = agent.model;
  let activeThinking = agent.thinking;
  const prewalk =
    agent.prewalk &&
    (agent.model !== agent.prewalk.implementation_model ||
      agent.thinking !== agent.prewalk.implementation_thinking)
      ? {
          todoSeen: agent.tools ? !agent.tools.includes("todo") : true,
          handoffTool: "",
          handedOff: false,
        }
      : undefined;
  for (let i = 0; i < attempts * 2; i++) {
    const request: PiRequest = {
      prompt: correction || user,
      systemPrompt: system,
      model: activeModel,
      thinking: activeThinking,
      sessionId: sid,
      sessionDir: `${run.sessionDir}/${agent.name}`,
      rawOutputPath: `${run.sessionDir}/${agent.name}/raw_output.jsonl`,
      stderrPath: `${run.sessionDir}/${agent.name}/stderr.log`,
      tools:
        prewalk && activeModel === agent.model
          ? (agent.tools?.filter((tool: string) => tool !== "bash") ?? null)
          : agent.tools,
      cwd: run.repoRoot,
      allowedEnv: agent.allowed_env,
      timeoutMs: run.cfg.defaults.harness_timeout_seconds * 1000,
      maxOutputBytes: run.cfg.defaults.max_output_bytes,
      signal: run.signal,
      stopWhen: prewalk
        ? (event: any) => {
            if (event?.type !== "tool_execution_end" || event.isError) return false;
            if (event.toolName === "todo") {
              prewalk.todoSeen = true;
              return false;
            }
            if (
              prewalk.todoSeen &&
              !prewalk.handoffTool &&
              (event.toolName === "edit" || event.toolName === "write")
            ) {
              prewalk.handoffTool = event.toolName;
              return true;
            }
            return false;
          }
        : undefined,
    };
    last = await runtime.run(
      request,
      (e) => {
        const toolCall = tracker.observe(e);
        if (toolCall)
          run.tracer.event({
            adw_id: run.adwId,
            phase_id: phase.phaseId,
            type: "tool_call",
            name: toolCall.label,
            payload: toolCall,
            started_at: toolCall.started_at,
            ended_at: toolCall.ended_at,
          });
      },
      (pid) => run.tracer.processStart(run.adwId, "agent", agent.name, pid, `pi ${agent.model}`),
      (pid) => run.tracer.processEnd(pid),
    );
    run.addUsage(last.tokens, last.cost);
    if (prewalk?.handoffTool && !prewalk.handedOff) {
      prewalk.handedOff = true;
      activeModel = agent.prewalk!.implementation_model;
      activeThinking = agent.prewalk!.implementation_thinking;
      correction = "Continue the task now. Implement and verify the approved work.";
      run.tracer.event({
        adw_id: run.adwId,
        phase_id: phase.phaseId,
        type: "prewalk_handoff",
        name: agent.name,
        payload: {
          session_id: sid,
          handoff_tool: prewalk.handoffTool,
          from_model: agent.model,
          to_model: activeModel,
          from_thinking: agent.thinking,
          to_thinking: activeThinking,
        },
      });
      continue;
    }
    let parsed: any;
    try {
      const raw = last.text.match(/\{[\s\S]*\}/)?.[0] || last.text;
      parsed = JSON.parse(raw);
      const env = (await import("./data_types")).envelope(call.outputType, parsed);
      run.tracer.envelope(run.adwId, phase.phaseId, agent.name, call.outputType, env, true, i + 1);
      for (const gate of call.gates) {
        const report = gate(env, run);
        run.tracer.gate(run.adwId, phase.phaseId, i + 1, gate.name || "gate", report);
        if (!report.passed) throw new Error(report.violations.join("; "));
      }
      enforce(run, before, agent, env);
      run.tracer.event({
        adw_id: run.adwId,
        phase_id: phase.phaseId,
        type: "handoff",
        name: agent.name,
        payload: {
          output_type: call.outputType,
          artifacts: env.artifacts || [],
          summary: env.summary || "",
        },
      });
      run.tracer.event({
        adw_id: run.adwId,
        phase_id: phase.phaseId,
        type: "agent_end",
        name: agent.name,
        payload: {
          status: "success",
          tokens: last.tokens,
          cost: last.cost,
          context_tokens: last.context_tokens,
          context_window: last.context_window,
        },
      });
      run.tracer.agentSession(run.adwId, agent, sid, last.context_tokens, last.context_window);
      await Bun.write(
        `${run.sessionDir}/${agent.name}/envelope.json`,
        JSON.stringify(env, null, 2),
      );
      run.console.agentFinished(agent.name, last.tokens, last.cost);
      return env;
    } catch (error) {
      run.tracer.envelope(
        run.adwId,
        phase.phaseId,
        agent.name,
        call.outputType,
        { error: String(error) },
        false,
        i + 1,
      );
      correction = `Correction: your previous response failed validation: ${String(error)}. Return only valid JSON matching ${call.outputType}.\n${call.prompt}`;
      if (i + 1 >= attempts * 2) throw error;
    }
  }
  throw new Error("agent execution failed");
}
