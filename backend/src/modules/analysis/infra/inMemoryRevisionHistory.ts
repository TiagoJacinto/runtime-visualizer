import type {
  ProcedureScope,
  RevisionKey,
  RevisionSummary,
} from "../../../../../packages/contracts/src/index.ts";
import type {
  AnalysisSnapshot,
  RevisionHistory,
  RevisionLease,
} from "../revisionHistory.ts";

export class InMemoryRevisionHistory implements RevisionHistory {
  private readonly rows = new Map<
    string,
    { snapshot: AnalysisSnapshot; refs: number }
  >();
  private readonly clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  async list(scope: ProcedureScope): Promise<readonly RevisionSummary[]> {
    return [...this.rows.values()]
      .flatMap(({ snapshot }) =>
        snapshot.file === scope.file &&
        snapshot.procedure.id === scope.procedureId
          ? [this.summary(snapshot)]
          : [],
      )
      .sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
  }

  async load(key: RevisionKey): Promise<AnalysisSnapshot | undefined> {
    return this.rows.get(this.key(key))?.snapshot;
  }

  async acquire(key: RevisionKey): Promise<RevisionLease | undefined> {
    const row = this.rows.get(this.key(key));
    if (!row) return undefined;
    row.refs += 1;
    let released = false;
    return {
      snapshot: row.snapshot,
      release: () => {
        if (!released) {
          released = true;
          row.refs -= 1;
        }
      },
    };
  }

  close(): void {}

  async save(snapshot: AnalysisSnapshot): Promise<"inserted" | "existing"> {
    const key = this.key(snapshot);
    const existing = this.rows.get(key);
    if (existing) return "existing";
    this.rows.set(key, {
      snapshot: {
        ...snapshot,
        analyzedAt: snapshot.analyzedAt || this.clock().toISOString(),
      },
      refs: 0,
    });
    await this.prune(snapshot.file, snapshot.procedure.id);
    return "inserted";
  }

  private async prune(file: string, procedureId: string): Promise<void> {
    const rows = [...this.rows.entries()]
      .filter(
        ([, row]) =>
          row.snapshot.file === file &&
          row.snapshot.procedure.id === procedureId,
      )
      .sort((a, b) =>
        b[1].snapshot.analyzedAt.localeCompare(a[1].snapshot.analyzedAt),
      );
    const cutoff = this.clock().getTime() - 30 * 24 * 60 * 60 * 1000;
    for (const [key, row] of rows.slice(20)) {
      if (row.refs === 0 && Date.parse(row.snapshot.analyzedAt) < cutoff)
        this.rows.delete(key);
    }
  }

  private summary(snapshot: AnalysisSnapshot): RevisionSummary {
    return {
      file: snapshot.file,
      procedureId: snapshot.procedure.id,
      revision: snapshot.revision,
      analyzedAt: snapshot.analyzedAt,
      runnable: snapshot.cfg !== null && snapshot.diagnostics.length === 0,
      diagnosticCount: snapshot.diagnostics.length,
    };
  }
  private key(value: {
    file: string;
    procedureId?: string;
    revision: string;
    procedure?: { id: string };
  }): string {
    return `${value.file}\0${value.procedureId ?? value.procedure?.id ?? ""}\0${value.revision}`;
  }
}
