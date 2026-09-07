export interface PiRequest {
  prompt: string;
  systemPrompt: string;
  model: string;
  thinking: string;
  sessionId: string;
  sessionDir: string;
  rawOutputPath: string;
  stderrPath: string;
  tools: string[] | null;
  cwd: string;
  allowedEnv: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  retry?: boolean;
  signal?: AbortSignal;
  stopWhen?: (event: unknown) => boolean;
}
export interface UsageBreakdown {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  cache_read_cost: number;
  cache_write_cost: number;
  total_cost: number;
}
export interface PiResult {
  text: string;
  returncode: number;
  session_id: string;
  tokens: number;
  cost: number;
  usage: UsageBreakdown;
  context_tokens: number;
  context_window: number;
}
export function usageZero(): UsageBreakdown {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 0,
    input_cost: 0,
    output_cost: 0,
    cache_read_cost: 0,
    cache_write_cost: 0,
    total_cost: 0,
  };
}
export function mergeUsage(
  a: UsageBreakdown,
  b: UsageBreakdown,
): UsageBreakdown {
  const out = { ...a };
  for (const k of Object.keys(out) as Array<keyof UsageBreakdown>)
    out[k] += b[k];
  return out;
}
export function addTurn(u: UsageBreakdown, usage: any, total: number) {
  u.input_tokens += usage.input || 0;
  u.output_tokens += usage.output || 0;
  u.cache_read_tokens += usage.cacheRead || 0;
  u.cache_write_tokens += usage.cacheWrite || 0;
  u.reasoning_tokens += usage.reasoning || 0;
  u.total_tokens += total;
  const c = usage.cost || {};
  u.input_cost += c.input || 0;
  u.output_cost += c.output || 0;
  u.cache_read_cost += c.cacheRead || 0;
  u.cache_write_cost += c.cacheWrite || 0;
  u.total_cost += c.total || 0;
}
