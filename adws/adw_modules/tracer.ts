import { Database } from "bun:sqlite";
import { appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { EventRecord, Phase, AgentConfig, GateReport } from "./data_types";
import { ensureDir, newId, nowIso } from "./utils";
export const SCHEMA = `CREATE TABLE IF NOT EXISTS sessions(adw_id TEXT PRIMARY KEY,adw_name TEXT,request TEXT,status TEXT,engineer TEXT,started_at TEXT,ended_at TEXT,total_tokens INTEGER DEFAULT 0,total_cost REAL DEFAULT 0,archived INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS phases(phase_id TEXT PRIMARY KEY,adw_id TEXT,seq INTEGER,name TEXT,kind TEXT,owner TEXT,description TEXT,status TEXT DEFAULT 'fail',attempt INTEGER DEFAULT 0,retries INTEGER DEFAULT 0,error TEXT,started_at TEXT,ended_at TEXT);
CREATE TABLE IF NOT EXISTS events(event_id TEXT PRIMARY KEY,adw_id TEXT,phase_id TEXT,parent_id TEXT,type TEXT,name TEXT,payload_json TEXT,tokens INTEGER,started_at TEXT,ended_at TEXT);
CREATE TABLE IF NOT EXISTS envelopes(envelope_id TEXT PRIMARY KEY,adw_id TEXT,phase_id TEXT,agent TEXT,output_type TEXT,payload_json TEXT,valid INTEGER,attempt INTEGER,created_at TEXT);
CREATE TABLE IF NOT EXISTS gate_results(id INTEGER PRIMARY KEY AUTOINCREMENT,adw_id TEXT,phase_id TEXT,attempt INTEGER,gate TEXT,passed INTEGER,violations_json TEXT,checks_json TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS processes(id INTEGER PRIMARY KEY AUTOINCREMENT,adw_id TEXT,kind TEXT,name TEXT,pid INTEGER,command TEXT,started_at TEXT,ended_at TEXT);
CREATE TABLE IF NOT EXISTS agent_sessions(adw_id TEXT,agent TEXT,coding_agent TEXT,model TEXT,color TEXT,session_id TEXT,context_tokens INTEGER,context_window INTEGER,created_at TEXT,last_used_at TEXT,PRIMARY KEY(adw_id,agent));`;
export function initializeSchema(db: Database): void {
  db.run(SCHEMA);
  const migrations = {
    "agent_sessions.color": [
      "PRAGMA table_info(agent_sessions)",
      "ALTER TABLE agent_sessions ADD COLUMN color TEXT",
      "color",
    ],
    "gate_results.checks_json": [
      "PRAGMA table_info(gate_results)",
      "ALTER TABLE gate_results ADD COLUMN checks_json TEXT",
      "checks_json",
    ],
    "sessions.adw_name": [
      "PRAGMA table_info(sessions)",
      "ALTER TABLE sessions ADD COLUMN adw_name TEXT",
      "adw_name",
    ],
    "agent_sessions.context_tokens": [
      "PRAGMA table_info(agent_sessions)",
      "ALTER TABLE agent_sessions ADD COLUMN context_tokens INTEGER",
      "context_tokens",
    ],
    "agent_sessions.context_window": [
      "PRAGMA table_info(agent_sessions)",
      "ALTER TABLE agent_sessions ADD COLUMN context_window INTEGER",
      "context_window",
    ],
    "sessions.archived": [
      "PRAGMA table_info(sessions)",
      "ALTER TABLE sessions ADD COLUMN archived INTEGER DEFAULT 0",
      "archived",
    ],
  } as const;
  for (const [info, alter, column] of Object.values(migrations)) {
    const cols = db.query(info).all() as any[];
    if (!cols.some((x) => x.name === column))
      try {
        db.run(alter);
      } catch (error) {
        if (process.env.SSSF_DEBUG)
          console.error(`trace schema migration skipped: ${String(error)}`);
      }
  }
}

export class Tracer {
  db: Database;
  constructor(
    public dbPath: string,
    public eventsJsonl: string,
  ) {
    ensureDir(dirname(dbPath));
    ensureDir(dirname(eventsJsonl));
    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode=WAL");
    this.db.run("PRAGMA synchronous=NORMAL");
    this.db.run("PRAGMA busy_timeout=5000");
    initializeSchema(this.db);
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code
  event(r: EventRecord) {
    const id = `evt_${newId(12)}`,
      ts = nowIso(),
      rec = { event_id: id, ts, ...r };
    appendFileSync(this.eventsJsonl, JSON.stringify(rec) + "\n");
    this.db
      .query(
        `INSERT INTO events(event_id,adw_id,phase_id,parent_id,type,name,payload_json,tokens,started_at,ended_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        r.adw_id,
        r.phase_id || "",
        r.parent_id || "",
        r.type,
        r.name || "",
        JSON.stringify(r.payload || {}),
        r.tokens ?? null,
        r.started_at || ts,
        r.ended_at ?? null,
      );
    return id;
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code
  sessionStart(id: string, engineer: string, name: string) {
    this.db
      .query(
        `INSERT INTO sessions(adw_id,adw_name,request,status,engineer,started_at) VALUES(?,?,?,?,?,?) ON CONFLICT(adw_id) DO UPDATE SET adw_name=excluded.adw_name,status='running',engineer=excluded.engineer`,
      )
      .run(id, name, "", "running", engineer, nowIso());
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code
  sessionRequest(id: string, request: string) {
    this.db.query("UPDATE sessions SET request=? WHERE adw_id=?").run(request, id);
  }
  sessionAddUsage(id: string, tokens: number, cost: number) {
    this.db
      .query(
        "UPDATE sessions SET total_tokens=COALESCE(total_tokens,0)+?, total_cost=COALESCE(total_cost,0)+? WHERE adw_id=?",
      )
      .run(tokens, cost, id);
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code
  sessionFinish(id: string, ok: boolean, status = ok ? "success" : "fail") {
    this.db
      .query("UPDATE sessions SET status=?,ended_at=? WHERE adw_id=?")
      .run(status, nowIso(), id);
    this.db
      .query("UPDATE processes SET ended_at=? WHERE adw_id=? AND ended_at IS NULL")
      .run(nowIso(), id);
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code
  processStart(id: string, kind: string, name: string, pid: number, command: string) {
    this.db
      .query("INSERT INTO processes(adw_id,kind,name,pid,command,started_at) VALUES(?,?,?,?,?,?)")
      .run(id, kind, name, pid, command, nowIso());
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code
  processEnd(pid: number) {
    this.db
      .query("UPDATE processes SET ended_at=? WHERE pid=? AND ended_at IS NULL")
      .run(nowIso(), pid);
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code
  maxPhaseSeq(id: string) {
    return Number(
      (this.db.query("SELECT COALESCE(MAX(seq),0) n FROM phases WHERE adw_id=?").get(id) as any)
        ?.n || 0,
    );
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code
  phaseUpsert(p: Phase) {
    this.db
      .query(
        `INSERT OR REPLACE INTO phases(phase_id,adw_id,seq,name,kind,owner,description,status,attempt,retries,error,started_at,ended_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        p.phaseId,
        p.adwId,
        p.seq,
        p.params.name,
        p.params.kind,
        p.params.owner,
        p.params.description,
        p.status,
        p.attempt,
        p.params.retries || 0,
        p.error || null,
        p.startedAt || null,
        p.endedAt || null,
      );
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code, sql-injection
  envelope(
    id: string,
    phase: string,
    agent: string,
    type: string,
    payload: any,
    valid: boolean,
    attempt: number,
  ) {
    this.db
      .query(
        "INSERT INTO envelopes(envelope_id,adw_id,phase_id,agent,output_type,payload_json,valid,attempt,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        `env_${newId(12)}`,
        id,
        phase,
        agent,
        type,
        JSON.stringify(payload),
        valid ? 1 : 0,
        attempt,
        nowIso(),
      );
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code
  gate(id: string, phase: string, attempt: number, name: string, r: GateReport) {
    this.db
      .query(
        "INSERT INTO gate_results(adw_id,phase_id,attempt,gate,passed,violations_json,checks_json,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        phase,
        attempt,
        name,
        r.passed ? 1 : 0,
        JSON.stringify(r.violations),
        JSON.stringify(r.checks),
        nowIso(),
      );
  }
  // pi-lens-ignore: ast-grep:no-sql-in-code
  agentSession(id: string, a: AgentConfig, sid: string, ctx: number, window: number) {
    this.db
      .query(
        `INSERT OR REPLACE INTO agent_sessions(adw_id,agent,coding_agent,model,color,session_id,context_tokens,context_window,created_at,last_used_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, a.name, a.coding_agent, a.model, a.color, sid, ctx, window, nowIso(), nowIso());
  }
}
