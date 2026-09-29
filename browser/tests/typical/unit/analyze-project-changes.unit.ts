import { describe, expect, it } from "vitest";

import { AnalyzeProject } from "../../../src/modules/analysis/index.ts";
import type {
  AnalysisSnapshot,
  AnalysisWorker,
} from "../../../src/modules/analysis/index.ts";
import type { ProjectFiles, SourceMap } from "../../../src/modules/project-files/index.ts";
import type { RevisionHistory } from "../../../src/modules/revision-history/index.ts";

const makeAnalyzer = (initial: SourceMap) => {
  let sourceMap = initial;
  const files: ProjectFiles = {
    listSourceFiles: () => Promise.resolve(Object.keys(sourceMap).toSorted()),
    readSource: (_projectId, path) => {
      const source = sourceMap[path];
      return source === undefined
        ? Promise.reject(new Error(`Source file not found: ${path}`))
        : Promise.resolve(source);
    },
    readSourceMap: () => Promise.resolve(sourceMap),
  };
  const worker: AnalysisWorker = {
    analyze: ({ file, files: sources, procedure, projectId, source }) =>
      Promise.resolve({
        analyzedAt: new Date().toISOString(),
        cfg: null,
        diagnostics: [],
        file,
        files: sources,
        procedure,
        procedureId: procedure.id,
        procedures: [procedure],
        projectId,
        revision: `${file}:${sources["src/helper.ts"] ?? "missing"}:${source}`,
        source,
      }),
  };
  const saved: AnalysisSnapshot[] = [];
  const revisions: RevisionHistory = {
    list: () => Promise.resolve([]),
    load: (key) =>
      Promise.resolve(
        saved.find(
          (snapshot) =>
            snapshot.projectId === key.projectId &&
            snapshot.file === key.file &&
            snapshot.procedureId === key.procedureId &&
            snapshot.revision === key.revision
        )
      ),
    save: (snapshot) => {
      const existing = saved.some(
        (item) =>
          item.projectId === snapshot.projectId &&
          item.file === snapshot.file &&
          item.procedureId === snapshot.procedureId &&
          item.revision === snapshot.revision
      );
      if (!existing) {
        saved.push(snapshot);
      }
      return Promise.resolve(existing ? "existing" : "inserted");
    },
  };
  return {
    analyzer: new AnalyzeProject(files, worker, revisions),
    saved,
    setSourceMap: (next: SourceMap) => {
      sourceMap = next;
    },
  };
};

describe("AnalyzeProject source changes", () => {
  it("creates a new selected-file revision while retaining the previous one", async () => {
    const initial: SourceMap = {
      "src/main.ts": "export function run() { return 1; }",
    };
    const { analyzer, saved } = makeAnalyzer(initial);
    const previous = await analyzer.analyse("project-1", "src/main.ts", "function:run");

    const [current] = await analyzer.applySourceChanges("project-1", [
      {
        change: "modified",
        file: "src/main.ts",
        source: "export function run() { return 2; }",
      },
    ]);

    expect(current).toMatchObject({
      file: "src/main.ts",
      source: "export function run() { return 2; }",
    });
    expect(current?.revision).not.toBe(previous.revision);
    expect(saved.some((snapshot) => snapshot.revision === previous.revision)).toBe(true);
  });

  it("reanalyzes importers using changed dependency source", async () => {
    const initial: SourceMap = {
      "src/helper.ts": "export const helper = () => 1;",
      "src/main.ts": "import { helper } from './helper'; export function run() { return helper(); }",
    };
    const { analyzer } = makeAnalyzer(initial);
    const previous = await analyzer.analyse("project-1", "src/main.ts", "function:run");

    const snapshots = await analyzer.applySourceChanges("project-1", [
      {
        change: "modified",
        file: "src/helper.ts",
        source: "export const helper = () => 2;",
      },
    ]);
    const refreshed = snapshots.find((snapshot) => snapshot.file === "src/main.ts");

    expect(refreshed).toMatchObject({
      file: "src/main.ts",
      files: { "src/helper.ts": "export const helper = () => 2;" },
    });
    expect(refreshed?.revision).not.toBe(previous.revision);
  });

  it("reanalyzes dependents after a dependency is deleted", async () => {
    const initial: SourceMap = {
      "src/helper.ts": "export const helper = () => 1;",
      "src/main.ts": "import { helper } from './helper'; export function run() { return helper(); }",
    };
    const { analyzer } = makeAnalyzer(initial);
    await analyzer.analyse("project-1", "src/main.ts", "function:run");

    const snapshots = await analyzer.applySourceChanges("project-1", [
      { change: "deleted", file: "src/helper.ts" },
    ]);
    const refreshed = snapshots.find((snapshot) => snapshot.file === "src/main.ts");

    expect(refreshed?.files).not.toHaveProperty("src/helper.ts");
    expect(refreshed?.file).toBe("src/main.ts");
  });

  it("analyzes a newly added source using the updated project map", async () => {
    const { analyzer, setSourceMap } = makeAnalyzer({
      "src/main.ts": "export const main = true;",
    });
    await analyzer.analyse("project-1", "src/main.ts");
    setSourceMap({
      "src/helper.ts": "export const helper = true;",
      "src/main.ts": "export const main = true;",
    });

    const snapshots = await analyzer.applySourceChanges("project-1", [
      {
        change: "added",
        file: "src/helper.ts",
        source: "export const helper = true;",
      },
    ]);

    expect(snapshots.some((snapshot) => snapshot.file === "src/helper.ts")).toBe(true);
    expect(snapshots.find((snapshot) => snapshot.file === "src/helper.ts")?.source).toBe(
      "export const helper = true;"
    );
  });
});
