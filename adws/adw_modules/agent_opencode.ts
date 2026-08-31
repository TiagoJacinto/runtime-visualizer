import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { AgentRuntime } from "./agent_runtime";
import { PiRequest, PiResult, usageZero } from "./data_types";
import { runProcess } from "./process";

const OPENCODE_PATH = process.env.OPENCODE_PATH || "opencode";
function resolveModel(pattern: string) {
  const [provider, ...rest] = pattern.split("/");
  if (!provider || !rest.length || !rest.join("/"))
    throw new Error(`OpenCode model must be provider/model: ${pattern}`);
  return [provider, rest.join("/")] as const;
}

function assertCredential(_provider: string) {
  // OpenCode owns authentication and may provide free models without a key.
}

function sessionFile(req: PiRequest) {
  const digest = createHash("sha256").update(req.sessionId).digest("hex").slice(0, 24);
  return `${req.sessionDir}/.${digest}.opencode-session`;
}

function sessionId(path: string) {
  try {
    return readFileSync(path, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function textOf(event: any) {
  const part = event?.part || {};
  return String(part.text || event?.text || "");
}

function contextWindow() {
  return 0;
}

function isEnvelope(text: string) {
  const candidates = [text.trim()];
  const match = text.match(/\{[\s\S]*\}/);
  if (match && match[0] !== candidates[0]) candidates.push(match[0]);
  return candidates.some((candidate) => {
    try {
      const value = JSON.parse(candidate);
      return Boolean(value && (value.status === "success" || value.status === "fail"));
    } catch {
      return false;
    }
  });
}

export async function run(
  req: PiRequest,
  onEvent?: (event: any) => void,
  onSpawn?: (pid: number) => void,
  onExit?: (pid: number) => void,
): Promise<PiResult> {
  const [provider, id] = resolveModel(req.model);
  assertCredential(provider);
  mkdirSync(dirname(req.rawOutputPath), { recursive: true });
  mkdirSync(dirname(req.stderrPath), { recursive: true });
  const mapping = sessionFile(req);
  const nativeSession = sessionId(mapping);
  const args = ["run", "--dir", req.cwd, "--format", "json", "-m", `${provider}/${id}`];
  if (nativeSession) args.push("--session", nativeSession);
  let prompt = req.prompt;
  if (req.systemPrompt) prompt = `${req.systemPrompt}\n\n${prompt}`;
  if (req.tools?.length)
    prompt += `\n\nRuntime tool contract: only use these tools: ${req.tools.join(", ")}.`;
  prompt += `\n\nRuntime thinking level: ${req.thinking}.`;
  args.push(prompt);
  const result: PiResult = {
    text: "",
    returncode: 0,
    session_id: req.sessionId,
    tokens: 0,
    cost: 0,
    usage: usageZero(),
    context_tokens: 0,
    context_window: contextWindow(),
  };
  let buffer = "";
  let stopped = false;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (req.signal?.aborted) controller.abort();
  else req.signal?.addEventListener("abort", abort, { once: true });
  const handle = (raw: string) => {
    appendFileSync(req.rawOutputPath, `${raw}\n`);
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (event.sessionID) {
      mkdirSync(dirname(mapping), { recursive: true });
      writeFileSync(mapping, `${event.sessionID}\n`, { mode: 0o600 });
    }
    if (event.type === "text") result.text += textOf(event);
    if (event.type === "tool_use") {
      const part = event.part || {};
      const state = part.state || {};
      const tool = String(part.tool || "");
      const id = String(part.callID || part.id || "");
      const args = state.input || {};
      onEvent?.({ type: "tool_execution_start", toolCallId: id, toolName: tool, args });
      if (state.status === "completed" || state.status === "error") {
        const isError = state.status === "error";
        const translated = {
          type: "tool_execution_end",
          toolCallId: id,
          toolName: tool,
          args,
          result: { content: [{ type: "text", text: String(state.output || "") }] },
          isError,
        };
        onEvent?.(translated);
        if (!isError && req.stopWhen?.(translated) && !stopped) {
          stopped = true;
          controller.abort();
        }
      }
    }
  };
  const process = await runProcess(OPENCODE_PATH, args, {
    cwd: req.cwd,
    allowedEnv: req.allowedEnv,
    timeoutMs: req.timeoutMs,
    maxOutputBytes: req.maxOutputBytes,
    signal: controller.signal,
    onSpawn,
    onExit,
    onStdoutChunk: (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) handle(line);
    },
    onStderrChunk: (chunk) => appendFileSync(req.stderrPath, chunk),
  });
  if (buffer.trim()) handle(buffer);
  req.signal?.removeEventListener("abort", abort);
  if (stopped) {
    result.returncode = process.exitCode ?? 0;
    return result;
  }
  if (process.failure || process.exitCode !== 0)
    throw new Error(`opencode ${process.failure || `exit ${process.exitCode}`}`);
  if (!req.retry && !isEnvelope(result.text)) {
    return run(
      {
        ...req,
        retry: true,
        prompt: req.tools?.includes("bash")
          ? "Return only the valid JSON envelope required by LocalAgentFactory. Do not call tools or include Markdown."
          : "Execute the plan now and make the first legitimate repository edit or write using only the allowed tools.",
      },
      onEvent,
      onSpawn,
      onExit,
    );
  }
  if (result.text) {
    onEvent?.({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: result.text }], usage: {} },
    });
    onEvent?.({
      type: "agent_end",
      messages: [{ role: "assistant", content: [{ type: "text", text: result.text }] }],
      willRetry: false,
    });
  }
  result.returncode = process.exitCode ?? 0;
  return result;
}

export const runtime: AgentRuntime = { resolveModel, assertCredential, contextWindow, run };
