import { AgentCall, Phase, PhaseParams, SSSFConfig } from "./data_types";
import type { Agent } from "./agent";
import { Console } from "./console";
import type { Tracer } from "./tracer";
import { atomicWrite, ensureDir, nowIso, redactSecrets } from "./utils";
import { ConfiguredAgent } from "./agents";
import * as git from "./git_helper";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

export interface WorkspaceSourceState {
  revision: string;
  workingTree: "Clean" | "Dirty";
}

export interface WorkspaceAdapter {
  isRepository(path: string): boolean;
  inspectSource(path: string): WorkspaceSourceState;
  cloneRepository(source: string, destination: string): string;
  copyRepository(source: string, destination: string): void;
}

export interface RunFileSystem {
  ensureDir(path: string): string;
  exists(path: string): boolean;
  remove(path: string): void;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  atomicWrite(path: string, content: string): string;
}

export interface RunConsole {
  sessionStarted(id: string, engineer: string): void;
  note(message: string): void;
  phaseStarted(phase: Phase): void;
  phaseEnded(phase: Phase, seconds: number): void;
  sessionFinished(ok: boolean, tokens: number, cost: number, db: string, status?: string): void;
}

export interface RunDependencies {
  sourceRoot?: string;
  workspaceRoot?: string;
  workspaceAdapter?: WorkspaceAdapter;
  fileSystem?: RunFileSystem;
  console?: RunConsole;
  nowIso?: () => string;
  nowMs?: () => number;
  setTimeout?: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout> | number;
  clearTimeout?: (timer: ReturnType<typeof setTimeout> | number) => void;
  agent?: Agent;
}

const productionFileSystem: RunFileSystem = {
  ensureDir,
  exists: existsSync,
  remove: (path) => rmSync(path, { recursive: true, force: true }),
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, content) => writeFileSync(path, content),
  atomicWrite,
};

const productionWorkspaceAdapter: WorkspaceAdapter = {
  isRepository: (path) => git.isRepo(path),
  inspectSource: (path) => git.inspectSource(path),
  cloneRepository: (source, destination) => git.cloneRepository(source, destination),
  copyRepository: (source, destination) => cpSync(source, destination, { recursive: true }),
};

export class PhaseHandle {
  constructor(
    public run: Run,
    public phase: Phase,
  ) {}
  log(payload: Record<string, unknown>) {
    this.run.tracer.event({
      adw_id: this.run.adwId,
      phase_id: this.phase.phaseId,
      type: "log",
      name: this.phase.params.name,
      payload,
    });
    this.run.console.note(
      Object.entries(payload)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", "),
    );
    if (this.phase.params.kind === "engineer" && payload.input) {
      this.run.tracer.sessionRequest(this.run.adwId, String(payload.input));
      this.run.writeEvidence("request.json", {
        adw_id: this.run.adwId,
        request: String(payload.input),
        created_at: this.run.currentIso(),
      });
    }
  }
  async call(c: AgentCall) {
    if (this.phase.params.kind !== "agent") throw new Error("call is only valid in an agent phase");
    return this.run.executeAgentCall(this.phase, c);
  }
}

export class Run {
  phases: Phase[] = [];
  tokens = 0;
  cost = 0;
  seq: number;
  repoRoot: string;
  sourceRoot: string;
  sourceRevision = "";
  gitEnabled = false;
  workspacePath = "";
  sessionDir: string;
  contextHandoffDir: string;
  runEvidenceDir: string;
  agentMap: Record<string, any>;
  console: RunConsole;
  private readonly abortController = new AbortController();
  private readonly timeoutTimer: ReturnType<typeof setTimeout> | number;
  readonly nowIso: () => string;
  private readonly nowMs: () => number;
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout> | number) => void;
  private abortReason = "";
  private finalized = false;
  currentIso() {
    return this.nowIso();
  }

  get signal() {
    return this.abortController.signal;
  }

  constructor(
    public cfg: SSSFConfig,
    public adwId: string,
    public tracer: Tracer,
    public engineer: string,
    private readonly dependencies: RunDependencies = {},
  ) {
    this.nowIso = this.dependencies.nowIso || nowIso;
    this.nowMs = this.dependencies.nowMs || Date.now;
    this.clearTimer = this.dependencies.clearTimeout || clearTimeout;
    this.console = this.dependencies.console || new Console(tracer, adwId);
    this.seq = tracer.maxPhaseSeq(adwId);
    this.sourceRoot = this.dependencies.sourceRoot || git.repoRoot();
    this.repoRoot = this.sourceRoot;
    this.sessionDir = resolve(cfg.defaults.data_dir, "sessions", adwId);
    this.contextHandoffDir = resolve(this.sessionDir, "context_handoff");
    this.runEvidenceDir = resolve(cfg.defaults.data_dir, "runs", adwId);
    const timeoutMs = Math.max(0, cfg.defaults.run_timeout_seconds * 1000);
    this.timeoutTimer = (this.dependencies.setTimeout || setTimeout)(
      () => this.abort("whole-run timeout"),
      timeoutMs,
    );
    const timer = this.timeoutTimer as { unref?: () => void };
    timer.unref?.();
    const p = `${this.sessionDir}/agent_map.json`;
    this.agentMap = {};
    const fileSystem = this.dependencies.fileSystem || productionFileSystem;
    if (fileSystem.exists(p))
      try {
        this.agentMap = JSON.parse(fileSystem.readFile(p)) || {};
      } catch {
        this.agentMap = {};
      }
  }

  prepareWorkspace(expectedRevision?: string) {
    const workspaceAdapter = this.dependencies.workspaceAdapter || productionWorkspaceAdapter;
    const fileSystem = this.dependencies.fileSystem || productionFileSystem;
    this.gitEnabled = workspaceAdapter.isRepository(this.sourceRoot);
    fileSystem.ensureDir(this.contextHandoffDir);
    fileSystem.ensureDir(this.runEvidenceDir);
    const workspace = resolve(
      this.dependencies.workspaceRoot || resolve(tmpdir(), "local-agent-factory"),
      this.adwId,
    );
    fileSystem.ensureDir(
      this.dependencies.workspaceRoot || resolve(tmpdir(), "local-agent-factory"),
    );
    if (fileSystem.exists(workspace)) fileSystem.remove(workspace);
    if (this.gitEnabled) {
      const before = workspaceAdapter.inspectSource(this.sourceRoot);
      if (before.workingTree !== "Clean")
        throw new Error("source preflight failed: working tree is dirty");
      if (expectedRevision && before.revision !== expectedRevision)
        throw new Error(
          `source preflight failed: expected ${expectedRevision}, found ${before.revision}`,
        );
      this.sourceRevision = before.revision;
      workspaceAdapter.cloneRepository(this.sourceRoot, workspace);
      const after = workspaceAdapter.inspectSource(this.sourceRoot);
      if (after.workingTree !== "Clean" || after.revision !== this.sourceRevision)
        throw new Error("source preflight failed: source changed during workspace creation");
      this.writeEvidence("source.json", {
        path: this.sourceRoot,
        before_revision: before.revision,
        before_working_tree: before.workingTree,
        expected_revision: this.sourceRevision,
        after_clone_revision: after.revision,
        after_clone_working_tree: after.workingTree,
        workspace,
      });
    } else {
      workspaceAdapter.copyRepository(this.sourceRoot, workspace);
      this.writeEvidence("source.json", {
        path: this.sourceRoot,
        git: false,
        workspace,
        limitations: ["no source integrity check", "no commits", "no Git diff/change capture"],
      });
    }
    this.workspacePath = workspace;
    this.repoRoot = workspace;
    this.writeEvidence("workspace.txt", `${workspace}\n`);
  }

  writeEvidence(name: string, value: unknown) {
    const content = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    const fileSystem = this.dependencies.fileSystem || productionFileSystem;
    return fileSystem.atomicWrite(resolve(this.runEvidenceDir, name), redactSecrets(content));
  }

  saveAgentMap(agent: string, entry: any) {
    this.agentMap[agent] = entry;
    const fileSystem = this.dependencies.fileSystem || productionFileSystem;
    fileSystem.writeFile(
      `${this.sessionDir}/agent_map.json`,
      JSON.stringify(this.agentMap, null, 2),
    );
  }
  addUsage(tokens: number, cost: number) {
    this.tokens += tokens;
    this.cost += cost;
    this.tracer.sessionAddUsage(this.adwId, tokens, cost);
  }
  async executeAgentCall(phase: Phase, call: AgentCall) {
    const agent = this.dependencies.agent || new ConfiguredAgent();
    return agent.execute(this, phase, call);
  }
  abort(reason: string) {
    if (this.signal.aborted) return;
    this.abortReason = reason;
    this.abortController.abort(reason);
    this.tracer.event({
      adw_id: this.adwId,
      type: "error",
      name: "process",
      payload: { failure: reason },
    });
  }
  private finalSourceState() {
    try {
      return (this.dependencies.workspaceAdapter || productionWorkspaceAdapter).inspectSource(
        this.sourceRoot,
      );
    } catch {
      return undefined;
    }
  }
  private sourceIntegrityError(state = this.finalSourceState()) {
    if (!state) return "source integrity check failed: source state is unavailable";
    if (state.revision !== this.sourceRevision || state.workingTree !== "Clean")
      return `source integrity violation: revision ${state.revision}, working tree ${state.workingTree}`;
    return undefined;
  }
  private finalize(ok: boolean, reason = "", statusOverride?: string) {
    if (this.finalized) return !reason && ok;
    this.finalized = true;
    this.clearTimer(this.timeoutTimer);
    const finalSource = this.gitEnabled ? this.finalSourceState() : undefined;
    const integrityError = this.gitEnabled ? this.sourceIntegrityError(finalSource) : undefined;
    const finalReason = integrityError || this.abortReason || reason;
    const accepted =
      statusOverride === "awaiting_review"
        ? !integrityError && !this.abortReason
        : ok && !finalReason;
    const status = statusOverride || (accepted ? "success" : "fail");
    if (integrityError)
      this.tracer.event({
        adw_id: this.adwId,
        type: "error",
        name: "source_integrity",
        payload: { error: integrityError },
      });
    this.writeEvidence("result.json", {
      adw_id: this.adwId,
      status,
      reason: finalReason || undefined,
      source: {
        path: this.sourceRoot,
        expected_revision: this.sourceRevision,
        actual_revision: finalSource?.revision,
        working_tree: finalSource?.workingTree,
        workspace: this.workspacePath,
      },
      tokens: this.tokens,
      cost: this.cost,
      ended_at: this.nowIso(),
    });
    this.tracer.sessionFinish(this.adwId, accepted, status);
    return accepted;
  }
  fail(reason: string) {
    return this.finalize(false, reason);
  }
  awaitReview(reason = "human review required") {
    if (!this.phases.every((phase) => phase.status === "success"))
      return this.finish(false, reason);
    this.writeEvidence("review.json", {
      status: "awaiting_review",
      reason,
      workspace: this.workspacePath,
      source_revision: this.sourceRevision,
      integration: "manual",
    });
    this.tracer.event({
      adw_id: this.adwId,
      type: "log",
      name: "human_review",
      payload: {
        status: "awaiting_review",
        reason,
        workspace: this.workspacePath,
        integration: "manual",
      },
    });
    const accepted = this.finalize(true, "", "awaiting_review");
    this.console.sessionFinished(
      accepted,
      this.tokens,
      this.cost,
      this.cfg.observability.db,
      accepted ? "awaiting_review" : "fail",
    );
    return accepted ? 0 : 1;
  }

  async phase(params: PhaseParams, body: (ph: PhaseHandle) => Promise<void> | void) {
    if (this.signal.aborted) throw new Error(this.abortReason || "workflow canceled");
    if (
      !params.description.trim() ||
      params.description.trim().replace(/\.$/, "").toLowerCase() ===
        params.name.replaceAll("_", " ").toLowerCase()
    )
      throw new Error(`phase ${params.name}: description must explain what it does and why`);
    this.seq++;
    const phase: Phase = {
      phaseId: `${this.adwId}_${String(this.seq).padStart(2, "0")}_${params.name}`,
      adwId: this.adwId,
      seq: this.seq,
      params,
      status: "running",
      attempt: 0,
      startedAt: this.nowIso(),
    };
    this.phases.push(phase);
    this.tracer.phaseUpsert(phase);
    this.tracer.event({
      adw_id: this.adwId,
      phase_id: phase.phaseId,
      type: "phase_start",
      name: params.name,
      payload: {
        kind: params.kind,
        owner: params.owner,
        description: params.description,
      },
    });
    this.console.phaseStarted(phase);
    const start = this.nowMs();
    try {
      await body(new PhaseHandle(this, phase));
      if (this.signal.aborted) throw new Error(this.abortReason || "workflow canceled");
      phase.status = "success";
      phase.endedAt = nowIso();
      this.tracer.event({
        adw_id: this.adwId,
        phase_id: phase.phaseId,
        type: "phase_end",
        name: params.name,
        payload: { status: "success" },
      });
      this.tracer.phaseUpsert(phase);
      this.console.phaseEnded(phase, (this.nowMs() - start) / 1000);
    } catch (error) {
      phase.status = "fail";
      phase.error = String(error instanceof Error ? error.message : error).slice(0, 1000);
      phase.endedAt = nowIso();
      this.tracer.event({
        adw_id: this.adwId,
        phase_id: phase.phaseId,
        type: "error",
        name: params.name,
        payload: { error: phase.error },
      });
      this.tracer.event({
        adw_id: this.adwId,
        phase_id: phase.phaseId,
        type: "phase_end",
        name: params.name,
        payload: { status: "fail" },
      });
      this.tracer.phaseUpsert(phase);
      this.fail(phase.error);
      this.console.phaseEnded(phase, (this.nowMs() - start) / 1000);
      this.console.sessionFinished(false, this.tokens, this.cost, this.cfg.observability.db);
      throw error;
    }
  }

  finish(accepted = true, reason = "") {
    const phasesOk = this.phases.every((phase) => phase.status === "success");
    const ok = this.finalize(
      phasesOk && accepted,
      reason || (!phasesOk ? "one or more phases failed" : ""),
    );
    if (reason && !ok) this.console.note(reason);
    this.console.sessionFinished(ok, this.tokens, this.cost, this.cfg.observability.db);
    return ok ? 0 : 1;
  }
}
