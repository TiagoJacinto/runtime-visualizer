/* oxlint-disable avoid-new -- IndexedDB exposes event-based requests, not awaitable promises. */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import type { AnalysisSnapshot } from "../../../src/modules/analysis/index.ts";
import { IndexedDbRevisionHistory } from "../../../src/modules/revision-history/index.ts";

const DATABASE = "runtime-visualizer";

const snapshot = (
  projectId: string,
  source: string,
  revision: string
): AnalysisSnapshot => ({
  analyzedAt: "2026-09-25T00:00:00.000Z",
  cfg: null,
  diagnostics: [],
  file: "src/main.ts",
  files: { "src/main.ts": source },
  procedure: {
    id: "function:main",
    kind: "Function",
    label: "main",
    name: "main",
  },
  procedureId: "function:main",
  procedures: [
    {
      id: "function:main",
      kind: "Function",
      label: "main",
      name: "main",
    },
  ],
  projectId,
  revision,
  source,
});

const deleteDatabase = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Unable to reset IndexedDB."))
    );
  });

const openDatabase = (version?: number): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request =
      version === undefined
        ? indexedDB.open(DATABASE)
        : indexedDB.open(DATABASE, version);
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Unable to open IndexedDB for assertion."))
    );
  });

const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB assertion failed."))
    );
  });

beforeEach(async () => {
  await deleteDatabase();
});

describe("IndexedDB revision history", () => {
  it("round-trips immutable snapshots with project-scoped revisions", async () => {
    const history = new IndexedDbRevisionHistory();
    const first = snapshot("project-one", "export const value = 1;", "rev-1");
    const second = snapshot("project-two", "export const value = 2;", "rev-1");

    await expect(history.save(first)).resolves.toBe("inserted");
    await expect(history.save(second)).resolves.toBe("inserted");
    await expect(
      history.load({
        file: first.file,
        procedureId: first.procedureId,
        projectId: "project-one",
        revision: first.revision,
      })
    ).resolves.toEqual(first);
    await expect(
      history.load({
        file: second.file,
        procedureId: second.procedureId,
        projectId: "project-two",
        revision: second.revision,
      })
    ).resolves.toEqual(second);
    await expect(
      history.list({
        file: first.file,
        procedureId: first.procedureId,
        projectId: "project-one",
      })
    ).resolves.toMatchObject([{ revision: "rev-1" }]);
  });

  it("deduplicates identical revisions and shared source content", async () => {
    const history = new IndexedDbRevisionHistory();
    const first = snapshot("project-one", "export const shared = true;", "rev-1");
    const second = snapshot("project-two", "export const shared = true;", "rev-1");

    await expect(history.save(first)).resolves.toBe("inserted");
    await expect(history.save(first)).resolves.toBe("existing");
    await expect(history.save(second)).resolves.toBe("inserted");

    const database = await openDatabase();
    try {
      await expect(
        requestValue(database.transaction("sources").objectStore("sources").count())
      ).resolves.toBe(1);
      await expect(
        requestValue(database.transaction("revisions").objectStore("revisions").count())
      ).resolves.toBe(2);
    } finally {
      database.close();
    }
  });

  it("upgrades an existing project database without losing its store", async () => {
    const oldDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.addEventListener("upgradeneeded", () => {
        request.result.createObjectStore("projects", { keyPath: "id" });
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("Unable to create the old schema."))
      );
    });
    oldDatabase.close();

    const history = new IndexedDbRevisionHistory();
    await expect(
      history.save(snapshot("project-one", "export const value = 1;", "rev-1"))
    ).resolves.toBe("inserted");

    const database = await openDatabase();
    try {
      expect(database.objectStoreNames.contains("projects")).toBe(true);
      expect(database.objectStoreNames.contains("sources")).toBe(true);
      expect(database.objectStoreNames.contains("revisions")).toBe(true);
    } finally {
      database.close();
    }
  });
});
