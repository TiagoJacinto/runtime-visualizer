import { Phase } from "./data_types";
import { Tracer } from "./tracer";
const clip = (s: string, n = 160) => {
  s = String(s).replace(/\s+/g, " ");
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
};
export class Console {
  phaseId = "";
  phaseName = "";
  results: string[] = [];
  finished = false;
  constructor(
    public tracer: Tracer,
    public adwId: string,
  ) {}
  emit(message: string, level = "info") {
    console.log(message);
    this.tracer.event({
      adw_id: this.adwId,
      phase_id: this.phaseId,
      type: "log",
      name: this.phaseName || "console",
      payload: { message, level },
    });
  }
  sessionStarted(id: string, eng: string) {
    this.emit(`adw_id: ${id}   engineer ${eng}`);
  }
  sessionFinished(
    ok: boolean,
    tokens: number,
    cost: number,
    db: string,
    status = ok ? "success" : "fail",
  ) {
    if (this.finished) return;
    this.finished = true;
    const p = this.results.filter((x) => x === "success").length;
    this.emit(
      `session ${this.adwId} ${status} · ${p}/${this.results.length} phases · ${tokens.toLocaleString()} tokens · $${cost.toFixed(4)} · db ${db}`,
      ok ? "info" : "error",
    );
  }
  phaseStarted(p: Phase) {
    this.phaseId = p.phaseId;
    this.phaseName = p.params.name;
    this.emit(
      `▶ ${String(p.seq).padStart(2, "0")} ${p.params.name}  [${p.params.kind}] · ${p.params.owner}  ${clip(p.params.description)}`,
    );
  }
  phaseEnded(p: Phase, seconds: number) {
    const ok = p.status === "success";
    this.results.push(p.status);
    this.emit(
      `${ok ? "✓" : "✗"} ${p.params.name} ${seconds.toFixed(1)}s${p.error ? ` ${clip(p.error)}` : ""}`,
      ok ? "info" : "error",
    );
    this.phaseId = "";
    this.phaseName = "";
  }
  note(m: string) {
    this.emit(`  · ${clip(m)}`);
  }
  agentStarted(n: string, m: string, s: string) {
    this.emit(`  ▸ ${n} ${m} session ${s}`);
  }
  agentFinished(n: string, t: number, c: number) {
    this.emit(`  ◂ ${n} ${t.toLocaleString()} tokens $${c.toFixed(4)}`);
  }
}
