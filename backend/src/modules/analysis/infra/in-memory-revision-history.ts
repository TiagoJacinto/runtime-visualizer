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

export class InMemoryRevisionHistory implements RevisionHistory {
  private readonly rows = new Map<
    string,
    { snapshot: AnalysisSnapshot; refs: number }
  >();
  private readonly clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  list(scope: ProcedureScope): Promise<readonly RevisionSummary[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .flatMap(({ snapshot }) =>
          snapshot.file === scope.file &&
          snapshot.procedure.id === scope.procedureId
            ? [InMemoryRevisionHistory.summary(snapshot)]
            : []
        )
        .toSorted((a, b) => b.analyzedAt.localeCompare(a.analyzedAt))
    );
  }

  load(key: RevisionKey): Promise<AnalysisSnapshot | undefined> {
    return Promise.resolve(
      this.rows.get(InMemoryRevisionHistory.key(key))?.snapshot
    );
  }

  acquire(key: RevisionKey): Promise<RevisionLease | undefined> {
    const row = this.rows.get(InMemoryRevisionHistory.key(key));
    let lease: RevisionLease | undefined;
    if (row !== undefined) {
      row.refs += 1;
      let released = false;
      lease = {
        release: () => {
          if (!released) {
            released = true;
            row.refs -= 1;
          }
        },
        snapshot: row.snapshot,
      };
    }
    return Promise.resolve(lease);
  }

  close(): void {
    this.rows.clear();
  }

  save(snapshot: AnalysisSnapshot): Promise<"inserted" | "existing"> {
    const key = InMemoryRevisionHistory.key(snapshot);
    const existing = this.rows.get(key);
    if (existing) {
      return Promise.resolve("existing" as const);
    }
    this.rows.set(key, {
      refs: 0,
      snapshot: {
        ...snapshot,
        analyzedAt: snapshot.analyzedAt || this.clock().toISOString(),
      },
    });
    this.prune(snapshot.file, snapshot.procedure.id);
    return Promise.resolve("inserted");
  }

  private prune(file: string, procedureId: string): void {
    const rows = [...this.rows.entries()]
      .filter(
        ([, row]) =>
          row.snapshot.file === file &&
          row.snapshot.procedure.id === procedureId
      )
      .toSorted((a, b) =>
        b[1].snapshot.analyzedAt.localeCompare(a[1].snapshot.analyzedAt)
      );
    const cutoff = this.clock().getTime() - 30 * 24 * 60 * 60 * 1000;
    for (const [key, row] of rows.slice(20)) {
      if (row.refs === 0 && Date.parse(row.snapshot.analyzedAt) < cutoff) {
        this.rows.delete(key);
      }
    }
  }

  private static summary(snapshot: AnalysisSnapshot): RevisionSummary {
    return {
      analyzedAt: snapshot.analyzedAt,
      diagnosticCount: snapshot.diagnostics.length,
      file: snapshot.file,
      procedureId: snapshot.procedure.id,
      revision: snapshot.revision,
      runnable: snapshot.cfg !== null && snapshot.diagnostics.length === 0,
    };
  }
  private static key(value: {
    file: string;
    procedureId?: string;
    revision: string;
    procedure?: { id: string };
  }): string {
    return `${value.file}\0${value.procedureId ?? value.procedure?.id ?? ""}\0${value.revision}`;
  }
}
