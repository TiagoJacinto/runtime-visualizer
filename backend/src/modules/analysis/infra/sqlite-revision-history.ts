import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { RevisionSummarySchema } from "../../../../../packages/contracts/src/index.ts";
import type {
  ProcedureScope,
  RevisionKey,
  RevisionSummary,
} from "../../../../../packages/contracts/src/index.ts";
import type {
  AnalysisSnapshot,
  RevisionHistory,
  RevisionLease,
} from "../revision-history.ts";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const ProcedureJsonSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["TopLevel", "Function"]),
  label: z.string(),
  name: z.string().nullable(),
});
const SnapshotJsonSchema = z.object({
  analyzedAt: z.string().datetime(),
  cfg: z.unknown().nullable(),
  diagnostics: z.array(z.unknown()),
  file: z.string().min(1),
  files: z.record(z.string(), z.string()),
  procedures: z.array(ProcedureJsonSchema),
  revision: z.string().min(1),
  source: z.string(),
});

export class SqliteRevisionHistory implements RevisionHistory {
  private readonly db: Database;
  private readonly leases = new Map<string, number>();
  private readonly clock: () => Date;

  constructor(databasePath: string, clock: () => Date = () => new Date()) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.clock = clock;
    this.db.exec(
      "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS analysis_revisions (file_path TEXT NOT NULL, procedure_id TEXT NOT NULL, revision TEXT NOT NULL, analyzed_at TEXT NOT NULL, source TEXT NOT NULL, files_json TEXT NOT NULL, procedures_json TEXT NOT NULL, cfg_json TEXT, diagnostics_json TEXT NOT NULL, PRIMARY KEY (file_path, procedure_id, revision)); CREATE INDEX IF NOT EXISTS analysis_revisions_scope ON analysis_revisions(file_path, procedure_id, analyzed_at DESC);"
    );
  }

  list(scope: ProcedureScope): Promise<readonly RevisionSummary[]> {
    // SAFETY: The SELECT columns are fixed by the analysis_revisions schema.
    const rows = this.db
      .query(
        "SELECT revision, analyzed_at, cfg_json, diagnostics_json FROM analysis_revisions WHERE file_path = ? AND procedure_id = ? ORDER BY analyzed_at DESC"
      )
      .all(scope.file, scope.procedureId) as {
      revision: string;
      analyzed_at: string;
      cfg_json: string | null;
      diagnostics_json: string;
    }[];
    return Promise.resolve(
      rows.map((row) =>
        RevisionSummarySchema.parse({
          analyzedAt: row.analyzed_at,
          diagnosticCount: SqliteRevisionHistory.array(row.diagnostics_json)
            .length,
          file: scope.file,
          procedureId: scope.procedureId,
          revision: row.revision,
          runnable:
            row.cfg_json !== null &&
            SqliteRevisionHistory.array(row.diagnostics_json).length === 0,
        })
      )
    );
  }

  load(key: RevisionKey): Promise<AnalysisSnapshot | undefined> {
    // SAFETY: The SELECT * row shape is fixed by the analysis_revisions schema.
    const row = this.db
      .query(
        "SELECT * FROM analysis_revisions WHERE file_path = ? AND procedure_id = ? AND revision = ?"
      )
      .get(key.file, key.procedureId, key.revision) as Record<
      string,
      string | null
    > | null;
    return Promise.resolve(
      row === null ? undefined : SqliteRevisionHistory.decode(row)
    );
  }

  async acquire(key: RevisionKey): Promise<RevisionLease | undefined> {
    const snapshot = await this.load(key);
    if (!snapshot) {
      return undefined;
    }
    const leaseKey = SqliteRevisionHistory.key(key);
    this.leases.set(leaseKey, (this.leases.get(leaseKey) ?? 0) + 1);
    let released = false;
    return {
      release: () => {
        if (!released) {
          released = true;
          const count = (this.leases.get(leaseKey) ?? 1) - 1;
          if (count <= 0) {
            this.leases.delete(leaseKey);
          } else {
            this.leases.set(leaseKey, count);
          }
        }
      },
      snapshot,
    };
  }

  save(snapshot: AnalysisSnapshot): Promise<"inserted" | "existing"> {
    const analyzedAt = snapshot.analyzedAt || this.clock().toISOString();
    // Validate before writing: malformed snapshots must never become durable rows.
    SnapshotJsonSchema.parse(snapshot);
    const result = this.db.transaction(() => {
      const inserted = this.db
        .query(
          "INSERT OR IGNORE INTO analysis_revisions (file_path, procedure_id, revision, analyzed_at, source, files_json, procedures_json, cfg_json, diagnostics_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          snapshot.file,
          snapshot.procedure.id,
          snapshot.revision,
          analyzedAt,
          snapshot.source,
          JSON.stringify(snapshot.files),
          JSON.stringify(snapshot.procedures),
          snapshot.cfg === null ? null : JSON.stringify(snapshot.cfg),
          JSON.stringify(snapshot.diagnostics)
        );
      this.prune(snapshot.file, snapshot.procedure.id);
      return inserted.changes !== 0;
    })();
    return Promise.resolve(
      result ? ("inserted" as const) : ("existing" as const)
    );
  }

  close(): void {
    this.db.close();
  }

  private prune(file: string, procedureId: string): void {
    const cutoff = new Date(
      this.clock().getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    // SAFETY: The SELECT returns only the revision column declared as TEXT.
    const rows = this.db
      .query(
        "SELECT revision FROM analysis_revisions WHERE file_path = ? AND procedure_id = ? AND analyzed_at < ? ORDER BY analyzed_at DESC"
      )
      .all(file, procedureId, cutoff) as { revision: string }[];
    // SAFETY: The SELECT returns only the revision column declared as TEXT.
    const newest = new Set(
      (
        this.db
          .query(
            "SELECT revision FROM analysis_revisions WHERE file_path = ? AND procedure_id = ? ORDER BY analyzed_at DESC LIMIT 20"
          )
          // SAFETY: The SELECT returns only the revision column declared as TEXT.
          .all(file, procedureId) as { revision: string }[]
      ).map((row) => row.revision)
    );
    for (const row of rows) {
      const leaseKey = SqliteRevisionHistory.key({
        file,
        procedureId,
        revision: row.revision,
      });
      if (!newest.has(row.revision) && (this.leases.get(leaseKey) ?? 0) === 0) {
        this.db
          .query(
            "DELETE FROM analysis_revisions WHERE file_path = ? AND procedure_id = ? AND revision = ?"
          )
          .run(file, procedureId, row.revision);
      }
    }
  }

  private static decode(row: Record<string, string | null>): AnalysisSnapshot {
    const parse = (value: string | null | undefined): JsonValue => {
      if (value === null || value === undefined) {
        return null;
      }
      try {
        // SAFETY: The stored JSON is written by this module and validated on decode.
        return JSON.parse(value) as JsonValue;
      } catch {
        throw new Error("Invalid revision JSON");
      }
    };
    const decoded = SnapshotJsonSchema.parse({
      analyzedAt: row.analyzed_at,
      cfg: parse(row.cfg_json),
      diagnostics: parse(row.diagnostics_json),
      file: row.file_path,
      files: parse(row.files_json),
      procedures: parse(row.procedures_json),
      revision: row.revision,
      source: row.source,
    });
    const procedure = decoded.procedures.find(
      (item) => item.id === row.procedure_id
    );
    if (!procedure) {
      throw new Error("Invalid revision JSON");
    }
    return {
      ...decoded,
      // SAFETY: SnapshotJsonSchema validates the persisted cfg field before reconstruction.
      cfg: decoded.cfg as AnalysisSnapshot["cfg"],
      // SAFETY: SnapshotJsonSchema validates the persisted diagnostics field before reconstruction.
      diagnostics: decoded.diagnostics as AnalysisSnapshot["diagnostics"],
      procedure,
      // SAFETY: SnapshotJsonSchema validates the persisted procedures field before reconstruction.
      procedures: decoded.procedures as AnalysisSnapshot["procedures"],
    };
  }

  private static key(value: RevisionKey): string {
    return `${value.file}\0${value.procedureId}\0${value.revision}`;
  }
  private static array(value: string): JsonValue[] {
    try {
      // SAFETY: The stored JSON is written by this module and validated on decode.
      const parsed = JSON.parse(value) as JsonValue;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new Error("Invalid revision JSON");
    }
  }
}
