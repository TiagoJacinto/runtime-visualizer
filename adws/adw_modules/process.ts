import { spawn, spawnSync } from "node:child_process";
import type { Readable } from "node:stream";
import { executionEnv } from "./utils";

export type ProcessFailure = "timeout" | "canceled" | "exit" | "spawn";

export interface ProcessOptions {
  cwd?: string;
  env?: Record<string, string>;
  allowedEnv?: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onSpawn?: (pid: number) => void;
  onExit?: (pid: number) => void;
}

export interface ProcessResult {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  canceled: boolean;
  truncated: boolean;
  durationMs: number;
  failure?: ProcessFailure;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;

function appendBounded(current: string, chunk: string, limit: number) {
  const next = current + chunk;
  return next.length <= limit ? next : next.slice(next.length - limit);
}

function killTree(pid: number, force = false) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }
  const signal = force ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // The process already exited.
    }
  }
}

function collect(stream: Readable, limit: number, onChunk: ((chunk: string) => void) | undefined) {
  return (async () => {
    let value = "";
    let truncated = false;
    for await (const chunk of stream) {
      const text = String(chunk);
      onChunk?.(text);
      if (value.length + text.length > limit) truncated = true;
      value = appendBounded(value, text, limit);
    }
    return { value, truncated };
  })();
}

export async function runProcess(
  command: string,
  args: string[] = [],
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  let timedOut = false;
  let canceled = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let child;

  try {
    child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? executionEnv(options.allowedEnv),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
  } catch {
    return {
      command,
      args,
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      canceled: false,
      truncated: false,
      durationMs: Date.now() - started,
      failure: "spawn",
    };
  }
  options.onSpawn?.(child.pid ?? 0);

  const stop = (reason: "timeout" | "canceled") => {
    if (settled) return;
    if (reason === "timeout") timedOut = true;
    else canceled = true;
    killTree(child.pid ?? 0);
    setTimeout(() => killTree(child?.pid ?? 0, true), 250).unref();
  };

  if (timeoutMs > 0) timer = setTimeout(() => stop("timeout"), timeoutMs);
  const onAbort = () => stop("canceled");
  if (options.signal?.aborted) onAbort();
  else options.signal?.addEventListener("abort", onAbort, { once: true });

  const stdout = collect(child.stdout!, maxOutputBytes, options.onStdoutChunk);
  const stderr = collect(child.stderr!, maxOutputBytes, options.onStderrChunk);
  const exit = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
    child.once("error", () => resolve({ code: null, signal: null }));
  });
  const [out, err, result] = await Promise.all([stdout, stderr, exit]);
  settled = true;
  if (timer) clearTimeout(timer);
  options.onExit?.(child.pid ?? 0);
  options.signal?.removeEventListener("abort", onAbort);
  const failure: ProcessFailure | undefined = timedOut
    ? "timeout"
    : canceled
      ? "canceled"
      : result.code === 0
        ? undefined
        : "exit";
  return {
    command,
    args,
    exitCode: result.code,
    signal: result.signal,
    stdout: out.value,
    stderr: err.value,
    timedOut,
    canceled,
    truncated: out.truncated || err.truncated,
    durationMs: Date.now() - started,
    ...(failure ? { failure } : {}),
  };
}
