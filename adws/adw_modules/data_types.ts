export type PhaseKind = "engineer" | "agent" | "code";
export type PhaseStatus = "queued" | "running" | "success" | "fail";
export type Gate = (envelope: EnvelopeBase, run: RunLike) => GateReport;
export interface RunLike {
  repoRoot: string;
  contextHandoffDir: string;
  phases: Phase[];
}

export interface PhaseParams {
  name: string;
  kind: PhaseKind;
  owner: string;
  description: string;
  retries?: number;
  allowed_writes?: string[];
}
export interface Phase {
  phaseId: string;
  adwId: string;
  seq: number;
  params: PhaseParams;
  status: PhaseStatus;
  attempt: number;
  error?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface EnvelopeBase {
  status: "success" | "fail";
  summary?: string;
  artifacts?: string[];
  notes_for_next_agent?: string;
  [key: string]: unknown;
}
export interface PlanOutput extends EnvelopeBase {
  commit_message?: string;
}
export interface BuildOutput extends EnvelopeBase {
  changed_files?: string[];
  commit_message?: string;
}
export interface ScoutOutput extends EnvelopeBase {
  findings?: Array<{ file: string; note?: string }>;
}
export interface ReviewOutput extends EnvelopeBase {
  approved?: boolean;
  findings?: Array<{ requirement: string; met: boolean; evidence?: string }>;
  blocking?: string[];
}
export interface DocumentOutput extends EnvelopeBase {
  document_path?: string;
  documented_files?: string[];
  commit_message?: string;
}
export interface ChangesOutput extends EnvelopeBase {
  base?: string;
  changed_files?: string[];
  insertions?: number;
  deletions?: number;
  stat?: string;
  diff_path?: string;
}
export interface VerifyOutput extends EnvelopeBase {
  passed?: boolean;
  failures?: string[];
}
export type DoubleTddStateName =
  | "S0_SCOPE"
  | "S1_SELECT_OUTER"
  | "S2_WRITE_OUTER"
  | "S3_FOCUSED_OUTER"
  | "S4_SELECT_INNER"
  | "S5_INNER_RED"
  | "S6_INNER_GREEN"
  | "S7_UNIT_SUITE"
  | "S9_FULL_ACCEPTANCE"
  | "S10_COVERAGE"
  | "DONE";
export interface DoubleTddInventoryEntry {
  example: string;
  criterion: string;
  high_value_test?: string;
  status: "handled" | "unhandled" | "gap";
}
export interface DoubleTddState {
  STATE: DoubleTddStateName;
  ACCEPTANCE_FULL_COMMAND: string[] | null;
  UNIT_FULL_COMMAND: string[] | null;
  FOCUSED_OUTER_COMMAND: string[] | null;
  FOCUSED_INNER_COMMAND: string[] | null;
  INVENTORY: DoubleTddInventoryEntry[];
  SELECTED_EXAMPLE: string | null;
  OUTER_RED_PROOF: unknown;
  INNER_RESPONSIBILITY: string | null;
  INNER_TEST: string | null;
  INNER_RED_PROOF: unknown;
  LATEST_RESULTS: Record<string, unknown>;
}
export interface DoubleTddOutput extends EnvelopeBase {
  state?: DoubleTddStateName;
  acceptance_full_command?: string[];
  unit_full_command?: string[];
  focused_outer_command?: string[];
  focused_inner_command?: string[];
  inventory?: DoubleTddInventoryEntry[];
  selected_example?: string;
  criterion?: string;
  oracle?: string;
  high_value_test?: string;
  inner_responsibility?: string;
  inner_test?: string;
  red_proof?: string;
  failure_kind?: "plumbing" | "missing_behavior";
  handled?: boolean;
  acceptance_gap?: boolean;
}
export type OutputType =
  | "GenericOutput"
  | "PlanOutput"
  | "BuildOutput"
  | "ScoutOutput"
  | "ReviewOutput"
  | "DocumentOutput"
  | "ChangesOutput"
  | "VerifyOutput"
  | "DoubleTddOutput";
export class AgentCall {
  constructor(
    public outputType: OutputType,
    public prompt: string,
    public previous?: EnvelopeBase,
    public gates: Gate[] = [],
    public systemPromptAppendix = "",
  ) {}
}

export interface QualityCheckSpec {
  name: string;
  area: "frontend" | "backend";
  operation: "lint" | "typecheck" | "build";
  argv: string[];
  timeoutSeconds?: number;
}
export interface QualityCheckResult {
  name: string;
  area: string;
  operation: string;
  command: string;
  returncode: number;
  passed: boolean;
  duration_seconds: number;
  output_artifact: string;
  stdout_artifact?: string;
  stderr_artifact?: string;
  output_tail?: string;
  failure?: string;
  truncated?: boolean;
}
export interface QualityResult {
  passed: boolean;
  checks: QualityCheckResult[];
  failures: string[];
  artifacts: string[];
}
export interface ChangeCapture {
  base?: string;
  maxDiffLines?: number;
  includeUntracked?: boolean;
}
export interface BaseRef {
  ref: string;
  commit: string;
  reason: string;
  label: string;
}
export interface ChangeSet {
  base: BaseRef;
  files: string[];
  untracked: string[];
  insertions: number;
  deletions: number;
  stat: string;
  diffPath: string;
  truncated: boolean;
}
export interface GateCheck {
  item: string;
  ok: boolean;
  note: string;
}
export class GateReport {
  checks: GateCheck[] = [];
  check(item: string, ok: boolean, note = "") {
    this.checks.push({ item, ok, note });
    return this;
  }
  get violations() {
    return this.checks.filter((c) => !c.ok).map((c) => `${c.item}: ${c.note || "failed"}`);
  }
  get passed() {
    return this.violations.length === 0;
  }
}
export interface EventRecord {
  adw_id: string;
  phase_id?: string;
  type: string;
  name?: string;
  payload?: Record<string, unknown>;
  parent_id?: string;
  tokens?: number;
  started_at?: string;
  ended_at?: string;
}
export interface SSSFConfig {
  defaults: ConfigDefaults;
  observability: { db: string; poll_ms: number };
  agents: AgentConfig[];
}
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
export function mergeUsage(a: UsageBreakdown, b: UsageBreakdown): UsageBreakdown {
  const out = { ...a };
  for (const k of Object.keys(out) as Array<keyof UsageBreakdown>) out[k] += b[k];
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
export function envelope(type: OutputType, value: any): EnvelopeBase {
  if (
    !value ||
    typeof value !== "object" ||
    (value.status !== "success" && value.status !== "fail")
  )
    throw new Error("response is not a valid envelope: status must be success or fail");
  if (value.summary !== undefined && typeof value.summary !== "string")
    throw new Error("summary must be a string");
  if (
    value.artifacts !== undefined &&
    (!Array.isArray(value.artifacts) || value.artifacts.some((x: any) => typeof x !== "string"))
  )
    throw new Error("artifacts must be an array of strings");
  if (value.notes_for_next_agent !== undefined && typeof value.notes_for_next_agent !== "string")
    throw new Error("notes_for_next_agent must be a string");
  const array = (key: string) => {
    if (value[key] !== undefined && !Array.isArray(value[key]))
      throw new Error(`${type}.${key} must be an array`);
  };
  if (type === "ReviewOutput") {
    if (typeof value.approved !== "boolean")
      throw new Error("ReviewOutput.approved must be boolean");
    array("blocking");
    array("findings");
    for (const f of value.findings || [])
      if (typeof f?.requirement !== "string" || typeof f?.met !== "boolean")
        throw new Error("ReviewOutput.findings entries require requirement and met");
  }
  if (type === "BuildOutput") {
    array("changed_files");
    array("artifacts");
    if (value.commit_message !== undefined && typeof value.commit_message !== "string")
      throw new Error("BuildOutput.commit_message must be a string");
  }
  if (type === "ScoutOutput") {
    array("findings");
    for (const f of value.findings || [])
      if (typeof f?.file !== "string") throw new Error("ScoutOutput.findings entries require file");
  }
  if (
    type === "PlanOutput" &&
    value.commit_message !== undefined &&
    typeof value.commit_message !== "string"
  )
    throw new Error("PlanOutput.commit_message must be a string");
  if (type === "DocumentOutput") {
    array("documented_files");
    if (value.document_path !== undefined && typeof value.document_path !== "string")
      throw new Error("DocumentOutput.document_path must be a string");
  }
  if (type === "VerifyOutput") {
    if (typeof value.passed !== "boolean") throw new Error("VerifyOutput.passed must be boolean");
    array("failures");
  }
  return value as EnvelopeBase;
}
export function jsonEnvelope(e: EnvelopeBase) {
  return JSON.stringify(e, null, 2);
}
