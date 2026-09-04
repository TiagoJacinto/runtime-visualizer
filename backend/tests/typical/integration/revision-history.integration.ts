import { afterEach, describe, expect, it } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AnalysisSnapshot } from "../../../src/modules/analysis/revisionHistory.ts";
import { createApp } from "../../../src/shared/infra/http/app.js";

const procedure = { id: "procedure:prepare", kind: "Function" as const, name: "prepare", label: "prepare" };
function snapshot(revision: string, analyzedAt: string, diagnostics: readonly { procedure: string; reason: string }[] = []): AnalysisSnapshot {
  return { file: "main.ts", procedure, revision, source: `function prepare() { return ${revision}; }`, files: { "main.ts": "source" }, procedures: [procedure], cfg: diagnostics.length === 0 ? null : null, diagnostics, analyzedAt };
}

const sqliteAvailable = typeof globalThis.Bun !== "undefined";
const suite = sqliteAvailable ? describe : describe.skip;

type History = {
  save(snapshot: AnalysisSnapshot): Promise<"inserted" | "existing">;
  list(scope: { file: string; procedureId: string }): Promise<readonly { revision: string; procedureId: string; runnable: boolean; diagnosticCount: number }[]>;
  load(key: { file: string; procedureId: string; revision: string }): Promise<AnalysisSnapshot | undefined>;
  acquire(key: { file: string; procedureId: string; revision: string }): Promise<{ release(): void } | undefined>;
  close(): void;
};

suite("SQLite revision history", () => {
  let directory: string | undefined;
  let history: History | undefined;
  async function createHistory(database: string, clock?: () => Date): Promise<History> {
    const { SqliteRevisionHistory } = await import("../../../src/modules/analysis/infra/sqliteRevisionHistory.ts");
    return new SqliteRevisionHistory(database, clock);
  }
  afterEach(() => { history?.close(); return directory ? rm(directory, { recursive: true, force: true }) : undefined; });

  it("survives reopen, preserves stable IDs, loads the exact snapshot after source deletion, and reports diagnostics", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-history-"));
    const database = path.join(directory, "revisions.sqlite");
    await writeFile(path.join(directory, "main.ts"), "function prepare() { return 1; }\n");
    history = await createHistory(database);
    await history!.save(snapshot("one", new Date().toISOString()));
    const summaries = await history!.list({ file: "main.ts", procedureId: procedure.id });
    expect(summaries[0]).toMatchObject({ revision: "one", procedureId: procedure.id, diagnosticCount: 0 });
    history!.close();
    history = undefined;
    history = await createHistory(database);
    await rm(path.join(directory, "main.ts"));
    expect((await history!.load({ file: "main.ts", procedureId: procedure.id, revision: "one" }))?.source).toContain("return one");
    const diagnostic = snapshot("diagnostic", new Date().toISOString(), [{ procedure: procedure.id, reason: "missing dependency" }]);
    await history!.save(diagnostic);
    expect((await history!.list({ file: "main.ts", procedureId: procedure.id })).find((item) => item.revision === "diagnostic")).toMatchObject({ runnable: false, diagnosticCount: 1 });
    expect((await history!.load({ file: "main.ts", procedureId: procedure.id, revision: "diagnostic" }))?.diagnostics).toHaveLength(1);
  });

  it("saves idempotently and retains newest 20 plus leased expired rows", async () => {
    let now = new Date("2025-01-31T00:00:00.000Z");
    directory = await mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-retention-"));
    history = await createHistory(path.join(directory, "revisions.sqlite"), () => now);
    const old = new Date("2024-01-01T00:00:00.000Z").toISOString();
    const first = snapshot("r-0", old);
    expect(await history.save(first)).toBe("inserted");
    expect(await history!.save(first)).toBe("existing");
    const lease = await history!.acquire({ file: "main.ts", procedureId: procedure.id, revision: "r-0" });
    for (let index = 1; index <= 21; index++) await history!.save(snapshot(`r-${index}`, old));
    const retained = await history!.list({ file: "main.ts", procedureId: procedure.id });
    expect(retained).toHaveLength(21);
    expect(retained.map((item) => item.revision)).toContain("r-0");
    lease?.release();
    now = new Date("2025-02-01T00:00:00.000Z");
    await history!.save(snapshot("trigger", old));
    expect((await history!.load({ file: "main.ts", procedureId: procedure.id, revision: "r-0" }))).toBeUndefined();
  });

  it("does not re-analyze an explicitly unavailable revision", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-http-"));
    await writeFile(path.join(directory, "main.ts"), "function prepare() { return 1; }\n");
    const app = await createApp({ filesFolder: directory });
    const response = await app.inject({ method: "GET", url: "/api/analysis?file=main.ts&procedureId=missing&revision=gone" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "Revision unavailable" });
    await app.close();
  });
});
