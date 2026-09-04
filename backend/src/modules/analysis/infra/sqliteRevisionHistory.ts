import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { RevisionSummarySchema, type ProcedureScope, type RevisionKey, type RevisionSummary } from "../../../../../packages/contracts/src/index.ts";
import { z } from "zod";
import type { AnalysisSnapshot, RevisionHistory, RevisionLease } from "../revisionHistory.ts";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const ProcedureJsonSchema = z.object({ id: z.string().min(1), kind: z.enum(["TopLevel", "Function"]), name: z.string().nullable(), label: z.string() });
const SnapshotJsonSchema = z.object({
  file: z.string().min(1), revision: z.string().min(1), analyzedAt: z.string().datetime(), source: z.string(),
  files: z.record(z.string(), z.string()), procedures: z.array(ProcedureJsonSchema), cfg: z.unknown().nullable(), diagnostics: z.array(z.unknown()),
});

export class SqliteRevisionHistory implements RevisionHistory {
  private readonly db: Database;
  private readonly leases = new Map<string, number>();
  private readonly clock: () => Date;

  constructor(databasePath: string, clock: () => Date = () => new Date()) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.clock = clock;
    this.db.exec("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS analysis_revisions (file_path TEXT NOT NULL, procedure_id TEXT NOT NULL, revision TEXT NOT NULL, analyzed_at TEXT NOT NULL, source TEXT NOT NULL, files_json TEXT NOT NULL, procedures_json TEXT NOT NULL, cfg_json TEXT, diagnostics_json TEXT NOT NULL, PRIMARY KEY (file_path, procedure_id, revision)); CREATE INDEX IF NOT EXISTS analysis_revisions_scope ON analysis_revisions(file_path, procedure_id, analyzed_at DESC);");
  }

  async list(scope: ProcedureScope): Promise<readonly RevisionSummary[]> {
    const rows = this.db.query("SELECT revision, analyzed_at, cfg_json, diagnostics_json FROM analysis_revisions WHERE file_path = ? AND procedure_id = ? ORDER BY analyzed_at DESC").all(scope.file, scope.procedureId) as Array<{ revision: string; analyzed_at: string; cfg_json: string | null; diagnostics_json: string }>;
    return rows.map((row) => RevisionSummarySchema.parse({ file: scope.file, procedureId: scope.procedureId, revision: row.revision, analyzedAt: row.analyzed_at, runnable: row.cfg_json !== null && this.array(row.diagnostics_json).length === 0, diagnosticCount: this.array(row.diagnostics_json).length }));
  }

  async load(key: RevisionKey): Promise<AnalysisSnapshot | undefined> {
    const row = this.db.query("SELECT * FROM analysis_revisions WHERE file_path = ? AND procedure_id = ? AND revision = ?").get(key.file, key.procedureId, key.revision) as Record<string, string | null> | null;
    if (!row) return undefined;
    return this.decode(row);
  }

  async acquire(key: RevisionKey): Promise<RevisionLease | undefined> {
    const snapshot = await this.load(key);
    if (!snapshot) return undefined;
    const leaseKey = this.key(key);
    this.leases.set(leaseKey, (this.leases.get(leaseKey) ?? 0) + 1);
    let released = false;
    return { snapshot, release: () => { if (!released) { released = true; const count = (this.leases.get(leaseKey) ?? 1) - 1; if (count <= 0) this.leases.delete(leaseKey); else this.leases.set(leaseKey, count); } } };
  }

  async save(snapshot: AnalysisSnapshot): Promise<"inserted" | "existing"> {
    const analyzedAt = snapshot.analyzedAt || this.clock().toISOString();
    // Validate before writing: malformed snapshots must never become durable rows.
    SnapshotJsonSchema.parse(snapshot);
    const result = this.db.transaction(() => {
      const inserted = this.db.query("INSERT OR IGNORE INTO analysis_revisions (file_path, procedure_id, revision, analyzed_at, source, files_json, procedures_json, cfg_json, diagnostics_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(snapshot.file, snapshot.procedure.id, snapshot.revision, analyzedAt, snapshot.source, JSON.stringify(snapshot.files), JSON.stringify(snapshot.procedures), snapshot.cfg === null ? null : JSON.stringify(snapshot.cfg), JSON.stringify(snapshot.diagnostics));
      this.prune(snapshot.file, snapshot.procedure.id);
      return inserted.changes !== 0;
    })();
    return result ? "inserted" : "existing";
  }

  close(): void { this.db.close(); }

  private prune(file: string, procedureId: string): void {
    const cutoff = new Date(this.clock().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const rows = this.db.query("SELECT revision FROM analysis_revisions WHERE file_path = ? AND procedure_id = ? AND analyzed_at < ? ORDER BY analyzed_at DESC").all(file, procedureId, cutoff) as Array<{ revision: string }>;
    const newest = new Set((this.db.query("SELECT revision FROM analysis_revisions WHERE file_path = ? AND procedure_id = ? ORDER BY analyzed_at DESC LIMIT 20").all(file, procedureId) as Array<{ revision: string }>).map((row) => row.revision));
    for (const row of rows) {
      const leaseKey = this.key({ file, procedureId, revision: row.revision });
      if (!newest.has(row.revision) && (this.leases.get(leaseKey) ?? 0) === 0) {
        this.db.query("DELETE FROM analysis_revisions WHERE file_path = ? AND procedure_id = ? AND revision = ?").run(file, procedureId, row.revision);
      }
    }
  }

  private decode(row: Record<string, string | null>): AnalysisSnapshot {
    const parse = (value: string | null | undefined): JsonValue => { if (value === null || value === undefined) return null; try { return JSON.parse(value) as JsonValue; } catch { throw new Error("Invalid revision JSON"); } };
    const decoded = SnapshotJsonSchema.parse({ file: row.file_path, revision: row.revision, analyzedAt: row.analyzed_at, source: row.source, files: parse(row.files_json), procedures: parse(row.procedures_json), cfg: parse(row.cfg_json), diagnostics: parse(row.diagnostics_json) });
    const procedure = decoded.procedures.find((item) => item.id === row.procedure_id);
    if (!procedure) throw new Error("Invalid revision JSON");
    return { ...decoded, procedure, procedures: decoded.procedures as AnalysisSnapshot["procedures"], cfg: decoded.cfg as AnalysisSnapshot["cfg"], diagnostics: decoded.diagnostics as AnalysisSnapshot["diagnostics"] };
  }

  private key(value: RevisionKey): string { return `${value.file}\0${value.procedureId}\0${value.revision}`; }
  private array(value: string): JsonValue[] { const parsed = JSON.parse(value) as JsonValue; return Array.isArray(parsed) ? parsed : []; }
}
