import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AnalysisSnapshot } from "../../../src/modules/analysis/index.ts";

const procedure = {
  id: "procedure:prepare",
  kind: "Function" as const,
  label: "prepare",
  name: "prepare",
};

const snapshot = (
  revision: string,
  analyzedAt: string,
  diagnostics: readonly { procedure: string; reason: string }[] = [],
): AnalysisSnapshot => ({
  analyzedAt,
  cfg: null,
  diagnostics,
  file: "main.ts",
  files: { "main.ts": "source" },
  procedure,
  procedures: [procedure],
  revision,
  source: `function prepare() { return ${revision}; }`,
});

const sqliteAvailable = globalThis.Bun !== undefined;
const suite = sqliteAvailable ? describe : describe.skip;

interface History {
  acquire: (key: {
    file: string;
    procedureId: string;
    revision: string;
  }) => Promise<{ release: () => void } | undefined>;
  close: () => void;
  list: (scope: { file: string; procedureId: string }) => Promise<
    readonly {
      diagnosticCount: number;
      procedureId: string;
      revision: string;
      runnable: boolean;
    }[]
  >;
  load: (key: {
    file: string;
    procedureId: string;
    revision: string;
  }) => Promise<AnalysisSnapshot | undefined>;
  save: (snapshot: AnalysisSnapshot) => Promise<"inserted" | "existing">;
}

const createHistory = async (
  database: string,
  clock?: () => Date,
): Promise<History> => {
  const { SqliteRevisionHistory } = await import(
    "../../../src/modules/analysis/persistence.ts"
  );
  return new SqliteRevisionHistory(database, clock);
};

suite("SQLite revision history", () => {
  let directory: string | undefined;
  let history: History | undefined;

  afterEach(() => {
    history?.close();
    return directory
      ? rm(directory, { force: true, recursive: true })
      : undefined;
  });

  it("survives reopen, preserves stable IDs, loads the exact snapshot after source deletion, and reports diagnostics", async () => {
    directory = await mkdtemp(
      path.join(os.tmpdir(), "runtime-visualizer-history-"),
    );
    const database = path.join(directory, "revisions.sqlite");
    await writeFile(
      path.join(directory, "main.ts"),
      "function prepare() { return 1; }\n",
    );
    let current = await createHistory(database);
    history = current;
    await current.save(snapshot("one", new Date().toISOString()));
    const summaries = await current.list({
      file: "main.ts",
      procedureId: procedure.id,
    });
    expect(summaries[0]).toMatchObject({
      diagnosticCount: 0,
      procedureId: procedure.id,
      revision: "one",
    });
    current.close();
    history = undefined;
    current = await createHistory(database);
    history = current;
    await rm(path.join(directory, "main.ts"));
    const saved = await current.load({
      file: "main.ts",
      procedureId: procedure.id,
      revision: "one",
    });
    expect(saved?.source).toContain("return one");
    const diagnostic = snapshot("diagnostic", new Date().toISOString(), [
      { procedure: procedure.id, reason: "missing dependency" },
    ]);
    await current.save(diagnostic);
    const listed = await current.list({
      file: "main.ts",
      procedureId: procedure.id,
    });
    expect(
      listed.find((item) => item.revision === "diagnostic"),
    ).toMatchObject({ diagnosticCount: 1, runnable: false });
    const loadedDiagnostic = await current.load({
      file: "main.ts",
      procedureId: procedure.id,
      revision: "diagnostic",
    });
    expect(loadedDiagnostic?.diagnostics).toHaveLength(1);
  });

  it("saves idempotently and retains newest 20 plus leased expired rows", async () => {
    let now = new Date("2025-01-31T00:00:00.000Z");
    directory = await mkdtemp(
      path.join(os.tmpdir(), "runtime-visualizer-retention-"),
    );
    const current = await createHistory(
      path.join(directory, "revisions.sqlite"),
      () => now,
    );
    history = current;
    const old = new Date("2024-01-01T00:00:00.000Z").toISOString();
    const first = snapshot("r-0", old);
    expect(await current.save(first)).toBe("inserted");
    expect(await current.save(first)).toBe("existing");
    const lease = await current.acquire({
      file: "main.ts",
      procedureId: procedure.id,
      revision: "r-0",
    });
    for (let index = 1; index <= 21; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- SQLite writes must remain ordered.
      await current.save(snapshot(`r-${index}`, old));
    }
    const retained = await current.list({
      file: "main.ts",
      procedureId: procedure.id,
    });
    expect(retained).toHaveLength(21);
    expect(retained.map((item) => item.revision)).toContain("r-0");
    lease?.release();
    now = new Date("2025-02-01T00:00:00.000Z");
    await current.save(snapshot("trigger", old));
    const pruned = await current.load({
      file: "main.ts",
      procedureId: procedure.id,
      revision: "r-0",
    });
    expect(pruned).toBeUndefined();
  });
});
