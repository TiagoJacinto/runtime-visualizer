import { describe, expect, it } from "vitest";
import { InMemoryRevisionHistory } from "../../../src/modules/analysis/infra/inMemoryRevisionHistory.ts";
import type { AnalysisSnapshot } from "../../../src/modules/analysis/revisionHistory.ts";

const procedure = {
  id: "procedure:run",
  kind: "Function" as const,
  name: "run",
  label: "run",
};
const otherProcedure = {
  id: "procedure:other",
  kind: "Function" as const,
  name: "other",
  label: "other",
};

function snapshot(
  revision: string,
  analyzedAt = "2025-01-01T00:00:00.000Z",
  cfg: AnalysisSnapshot["cfg"] = null,
  diagnostics: AnalysisSnapshot["diagnostics"] = [],
): AnalysisSnapshot {
  return {
    file: "main.ts",
    procedure,
    revision,
    source: "function run() {}",
    files: { "main.ts": "function run() {}" },
    procedures: [procedure],
    cfg,
    diagnostics,
    analyzedAt,
  };
}

describe("in-memory revision history", () => {
  it("filters summaries by scope and reports runnable status", async () => {
    const history = new InMemoryRevisionHistory();
    await history.save(
      snapshot("diagnostic", "2025-01-01T00:00:00.000Z", null, [
        { procedure: "run", reason: "bad" },
      ]),
    );
    await history.save(
      snapshot("runnable", "2025-02-01T00:00:00.000Z", {
        functions: [],
        procedures: [],
      }),
    );
    await history.save({
      ...snapshot("other"),
      file: "other.ts",
      procedure: otherProcedure,
    });

    const rows = await history.list({
      file: "main.ts",
      procedureId: procedure.id,
    });
    expect(rows.map((row) => row.revision)).toEqual(["runnable", "diagnostic"]);
    expect(rows[0]).toMatchObject({ runnable: true, diagnosticCount: 0 });
    expect(rows[1]).toMatchObject({ runnable: false, diagnosticCount: 1 });
    expect(
      await history.list({ file: "missing.ts", procedureId: procedure.id }),
    ).toEqual([]);
  });

  it("loads and leases exact revisions, including missing keys and idempotent release", async () => {
    const history = new InMemoryRevisionHistory();
    const value = snapshot("one");
    expect(await history.save(value)).toBe("inserted");
    expect(await history.save(value)).toBe("existing");
    expect(
      await history.load({
        file: "main.ts",
        procedureId: procedure.id,
        revision: "missing",
      }),
    ).toBeUndefined();
    expect(
      await history.acquire({
        file: "main.ts",
        procedureId: procedure.id,
        revision: "missing",
      }),
    ).toBeUndefined();
    const lease = await history.acquire({
      file: "main.ts",
      procedureId: procedure.id,
      revision: "one",
    });
    expect(lease?.snapshot).toEqual(value);
    lease?.release();
    lease?.release();
  });

  it("prunes expired revisions only when they are outside the newest twenty and unleased", async () => {
    let now = new Date("2025-02-01T00:00:00.000Z");
    const history = new InMemoryRevisionHistory(() => now);
    const old = "2024-01-01T00:00:00.000Z";
    await history.save(snapshot("old", old));
    const lease = await history.acquire({
      file: "main.ts",
      procedureId: procedure.id,
      revision: "old",
    });
    for (let index = 1; index <= 20; index += 1)
      await history.save(
        snapshot(
          `new-${index}`,
          `2025-01-${String(index).padStart(2, "0")}T00:00:00.000Z`,
        ),
      );
    expect(
      await history.load({
        file: "main.ts",
        procedureId: procedure.id,
        revision: "old",
      }),
    ).toBeDefined();
    lease?.release();
    now = new Date("2025-03-01T00:00:00.000Z");
    await history.save(snapshot("trigger", old));
    expect(
      await history.load({
        file: "main.ts",
        procedureId: procedure.id,
        revision: "old",
      }),
    ).toBeUndefined();
  });
});
