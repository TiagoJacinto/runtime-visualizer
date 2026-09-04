import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { PiRequest, PiResult, usageZero, addTurn } from "./data_types";
import { operatorEnv, nowIso } from "./utils";
import { runProcess } from "./process";
import { AgentRuntime } from "./agent_runtime";

const PI_PATH = process.env.PI_PATH || "pi";
const MODELS = process.env.PI_MODELS_PATH || `${process.env.HOME}/.pi/agent/models.json`;
const CREDENTIALS: Record<string, string> = {
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  openai: "OPENAI_API_KEY",
};

function count(v: string) {
  const s = v.slice(-1).toUpperCase();
  return s === "K" ? +v.slice(0, -1) * 1e3 : s === "M" ? +v.slice(0, -1) * 1e6 : +v;
}

let catalogCache: Array<[string, string, number]> | null = null;

export function credentialForProvider(provider: string) {
  return CREDENTIALS[provider];
}

export function assertCredential(provider: string) {
  const key = credentialForProvider(provider);
  if (key && !process.env[key]) {
    throw new Error(`provider ${provider} requires ${key} before an agent can run`);
  }
}

export function catalog() {
  if (catalogCache) return catalogCache;
  const r = spawnSync(PI_PATH, ["--list-models"], {
    encoding: "utf8",
    timeout: 30000,
    env: operatorEnv(),
  });
  if (r.status !== 0) return (catalogCache = []);
  return (catalogCache = (r.stdout || "")
    .split("\n")
    .slice(1)
    .flatMap((l: string) => {
      const c = l.trim().split(/\s+/);
      if (c.length < 3) return [];
      try {
        return [[c[0], c[1], count(c[2])] as [string, string, number]];
      } catch {
        return [];
      }
    }));
}

export function resolveModel(pattern: string) {
  // A fully-qualified model is an explicit operator choice. Do not make it
  // depend on a live catalog request, which can be slow or temporarily stale.
  if (pattern.includes("/")) {
    const [p, ...rest] = pattern.split("/");
    return [p, rest.join("/")] as const;
  }
  const all = catalog();
  const matches = all.filter((x) => pattern === x[1] || x[1].includes(pattern));
  const exact = matches.filter((x) => x[1] === pattern || x[1].endsWith(`/${pattern}`));
  const resolved = exact.length === 1 ? exact : exact.length ? exact : matches;
  if (resolved.length !== 1) {
    throw new Error(
      resolved.length
        ? `model pattern ${pattern} is ambiguous: ${JSON.stringify(resolved)}`
        : `model pattern ${pattern} not found in pi --list-models`,
    );
  }
  return [resolved[0][0], resolved[0][1]] as const;
}

export function contextWindow(provider: string, id: string) {
  try {
    const j = JSON.parse(readFileSync(MODELS, "utf8"));
    const x = j.providers?.[provider]?.models?.find((m: any) => m.id === id);
    if (x) return x.contextWindow || 0;
  } catch {
    // Fall back to the live catalog.
  }
  return catalog().find((x) => x[0] === provider && x[1] === id)?.[2] || 0;
}

const textOf = (x: any) =>
  Array.isArray(x?.content)
    ? x.content
        .filter((p: any) => p?.type === "text")
        .map((p: any) => p.text || "")
        .join("")
    : "";
const clip = (x: string, n: number) => (x.length <= n ? x : `${x.slice(0, n).trimEnd()}…`);

function contextTokens(u: any) {
  return (
    u?.totalTokens ||
    (u?.input || 0) + (u?.output || 0) + (u?.cacheRead || 0) + (u?.cacheWrite || 0)
  );
}

function appendCapped(
  path: string,
  text: string,
  state: { bytes: number; capped: boolean },
  limit: number,
) {
  if (state.bytes >= limit) return;
  const remaining = limit - state.bytes;
  const value = text.slice(0, remaining);
  appendFileSync(path, value);
  state.bytes += value.length;
  if (value.length < text.length && !state.capped) {
    appendFileSync(path, "\n[output truncated]\n");
    state.capped = true;
  }
}

export async function run(
  req: PiRequest,
  onEvent?: (e: any) => void,
  onSpawn?: (pid: number) => void,
  onExit?: (pid: number) => void,
): Promise<PiResult> {
  const [provider, id] = resolveModel(req.model);
  assertCredential(provider);
  const args = [
    "-p",
    "--mode",
    "json",
    "--no-extensions",
    "--provider",
    provider,
    "--model",
    id,
    "--thinking",
    req.thinking,
    "--session",
    `${req.sessionDir}/${req.sessionId}.jsonl`,
    "--session-dir",
    req.sessionDir,
    "--system-prompt",
    req.systemPrompt,
  ];
  if (req.tools?.length) args.push("--tools", req.tools.join(","));
  args.push(req.prompt);
  mkdirSync(dirname(req.rawOutputPath), { recursive: true });
  mkdirSync(dirname(req.stderrPath), { recursive: true });
  const rawState = { bytes: 0, capped: false };
  const stderrState = { bytes: 0, capped: false };
  const result: PiResult = {
    text: "",
    returncode: 0,
    session_id: req.sessionId,
    tokens: 0,
    cost: 0,
    usage: usageZero(),
    context_tokens: 0,
    context_window: contextWindow(provider, id),
  };
  let buffer = "";
  let completed = false;
  let stoppedForHandoff = false;
  let terminalFailure = "";
  const processController = new AbortController();
  const abortForSignal = () => processController.abort();
  if (req.signal?.aborted) processController.abort();
  else req.signal?.addEventListener("abort", abortForSignal, { once: true });
  const handleLine = (raw: string) => {
    appendCapped(req.rawOutputPath, `${raw}\n`, rawState, req.maxOutputBytes);
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (event.type === "message_end" && event.message?.role === "assistant") {
      const text = textOf(event.message);
      if (text) result.text = text;
      const usage = event.message.usage || {};
      const turn = contextTokens(usage);
      result.tokens += turn;
      addTurn(result.usage, usage, turn);
      result.cost += usage.cost?.total || 0;
      if (turn && !(["aborted", "error"] as string[]).includes(event.message.stopReason))
        result.context_tokens = turn;
    }
    onEvent?.(event);
    if (req.stopWhen?.(event)) {
      stoppedForHandoff = true;
      processController.abort();
      return;
    }
    if (event.type === "agent_end") {
      const message = event.messages?.at(-1);
      if (message?.stopReason === "error") {
        terminalFailure = message.errorMessage || "provider returned an error";
        processController.abort();
      } else if (event.willRetry !== true) {
        completed = true;
        processController.abort();
      }
    }
  };
  const process = await runProcess(PI_PATH, args, {
    cwd: req.cwd,
    allowedEnv: [...req.allowedEnv, CREDENTIALS[provider]].filter(Boolean) as string[],
    timeoutMs: req.timeoutMs,
    maxOutputBytes: req.maxOutputBytes,
    signal: processController.signal,
    onSpawn,
    onExit,
    onStdoutChunk: (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) handleLine(line);
    },
    onStderrChunk: (chunk) => appendCapped(req.stderrPath, chunk, stderrState, req.maxOutputBytes),
  });
  if (buffer.trim()) handleLine(buffer);
  req.signal?.removeEventListener("abort", abortForSignal);
  if (terminalFailure) throw new Error(`pi provider error: ${terminalFailure}`);
  if (!stoppedForHandoff && !completed && (process.failure || process.exitCode !== 0)) {
    const reason = process.failure || `exit ${process.exitCode}`;
    throw new Error(`pi ${reason}: ${clip(process.stderr, 2000)}`.trim());
  }
  result.returncode = process.exitCode ?? 0;
  return result;
}

export const runtime: AgentRuntime = {
  resolveModel,
  assertCredential,
  contextWindow,
  run,
};

export class ToolCallTracker {
  open = new Map<string, { tool: string; args: any; started: string; clock: number }>();
  observe(e: any) {
    if (e.type === "message_end") {
      for (const block of e.message?.content || [])
        if (block?.type === "toolCall") this.announce(block.id, block.name, block.arguments);
      return;
    }
    if (e.type === "tool_execution_start") {
      this.announce(e.toolCallId, e.toolName, e.args);
      return;
    }
    if (e.type !== "tool_execution_end") return;
    const old = this.open.get(String(e.toolCallId)) || ({} as any);
    this.open.delete(String(e.toolCallId));
    const args = e.args || old.args || {};
    const value = Object.values(args).find((x: any) => typeof x === "string" && x.trim()) || "";
    return {
      tool: e.toolName || old.tool || "tool",
      tool_call_id: String(e.toolCallId || ""),
      args,
      label: `${e.toolName || old.tool || "tool"}: ${clip(String(value), 80)}`,
      ok: !e.isError,
      result_snippet: clip(textOf(e.result || {}), 20000),
      started_at: old.started || nowIso(),
      ended_at: nowIso(),
      duration_ms: old.clock ? Date.now() - old.clock : 0,
    };
  }
  announce(id: any, tool: any, args: any) {
    if (!id) return;
    const key = String(id);
    const old = this.open.get(key);
    this.open.set(key, {
      tool: tool || old?.tool || "",
      args: args || old?.args || {},
      started: old?.started || nowIso(),
      clock: old?.clock || Date.now(),
    });
  }
}
