import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSystemProjectFiles } from "../../../src/modules/project-files/file-system-project-files.ts";
import type {
  FileSystemDirectoryHandleLike,
  FileSystemFileHandleLike,
  FileSystemHandleLike,
} from "../../../src/modules/project-files/index.ts";

interface MutableSource {
  lastModified: number;
  reads: number;
  text: string;
}

const iterate = async function* iterate(
  items: readonly (readonly [string, FileSystemHandleLike])[]
): AsyncIterableIterator<readonly [string, FileSystemHandleLike]> {
  for (const item of items) {
    yield item;
  }
};

const sourceFile = (
  name: string,
  source: MutableSource
): FileSystemFileHandleLike => ({
  getFile: () => {
    const blob = new Blob([source.text]);
    return Promise.resolve(
      Object.assign(blob, {
        lastModified: source.lastModified,
        text: () => {
          source.reads += 1;
          return Promise.resolve(source.text);
        },
      })
    );
  },
  kind: "file",
  name,
});

const readFileSnapshot = (): Blob & { lastModified: number; size: number } =>
  Object.assign(new Blob(["export const value = 1;"]), { lastModified: 1 });

describe("project file change polling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses metadata to read only changed source and reports adds, edits, and deletes", async () => {
    vi.useFakeTimers();
    const main: MutableSource = {
      lastModified: 1,
      reads: 0,
      text: "export const value = 1;",
    };
    const helper: MutableSource = {
      lastModified: 1,
      reads: 0,
      text: "export const helper = true;",
    };
    const sourceEntries = new Map<string, FileSystemHandleLike>([
      ["main.ts", sourceFile("main.ts", main)],
    ]);
    const sourceDirectory: FileSystemDirectoryHandleLike = {
      entries: () => iterate([...sourceEntries]),
      kind: "directory",
      name: "src",
    };
    const root: FileSystemDirectoryHandleLike = {
      entries: () => iterate([["src", sourceDirectory]]),
      kind: "directory",
      name: "project",
      queryPermission: () => Promise.resolve("granted"),
    };
    const files = new FileSystemProjectFiles({
      get: () => Promise.resolve({ handle: root }),
    });
    const abort = new AbortController();
    const watcher = files.watchChanges("project-1", abort.signal)[Symbol.asyncIterator]();

    await expect(watcher.next()).resolves.toEqual({
      done: false,
      value: { type: "ready" },
    });
    expect(main.reads).toBe(0);

    const changes = watcher.next();
    await vi.advanceTimersByTimeAsync(250);
    expect(main.reads).toBe(0);

    main.text = "export const value = 2;";
    main.lastModified = 2;
    await vi.advanceTimersByTimeAsync(250);
    await expect(changes).resolves.toEqual({
      done: false,
      value: {
        changes: [
          {
            change: "modified",
            file: "src/main.ts",
            source: "export const value = 2;",
          },
        ],
        type: "changes",
      },
    });
    expect(main.reads).toBe(1);

    sourceEntries.set("helper.ts", sourceFile("helper.ts", helper));
    const added = watcher.next();
    await vi.advanceTimersByTimeAsync(250);
    await expect(added).resolves.toMatchObject({
      value: {
        changes: [
          {
            change: "added",
            file: "src/helper.ts",
            source: "export const helper = true;",
          },
        ],
        type: "changes",
      },
    });
    expect(helper.reads).toBe(1);

    sourceEntries.delete("main.ts");
    const deleted = watcher.next();
    await vi.advanceTimersByTimeAsync(250);
    await expect(deleted).resolves.toMatchObject({
      value: {
        changes: [{ change: "deleted", file: "src/main.ts" }],
        type: "changes",
      },
    });

    abort.abort();
    await expect(watcher.next()).resolves.toMatchObject({ done: true });
  });

  it("does not start another poll while a metadata read is still pending", async () => {
    vi.useFakeTimers();
    let getFileCalls = 0;
    let releaseRead: (() => void) | undefined;
    const handle: FileSystemFileHandleLike = {
      getFile: () => {
        getFileCalls += 1;
        if (getFileCalls !== 2) {
          return Promise.resolve(readFileSnapshot());
        }
        // SAFETY: hold one poll open to verify the next timer cannot overlap it.
        // oxlint-disable-next-line promise/avoid-new
        return new Promise<Blob & { lastModified: number; size: number }>((resolve) => {
          releaseRead = () => resolve(readFileSnapshot());
        });
      },
      kind: "file",
      name: "main.ts",
    };
    const sourceDirectory: FileSystemDirectoryHandleLike = {
      entries: () => iterate([["main.ts", handle]]),
      kind: "directory",
      name: "src",
    };
    const root: FileSystemDirectoryHandleLike = {
      entries: () => iterate([["src", sourceDirectory]]),
      kind: "directory",
      name: "project",
      queryPermission: () => Promise.resolve("granted"),
    };
    const files = new FileSystemProjectFiles({
      get: () => Promise.resolve({ handle: root }),
    });
    const abort = new AbortController();
    const watcher = files.watchChanges("project-1", abort.signal)[Symbol.asyncIterator]();

    await expect(watcher.next()).resolves.toMatchObject({
      value: { type: "ready" },
    });
    const nextPoll = watcher.next();
    await vi.advanceTimersByTimeAsync(250);
    expect(getFileCalls).toBe(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(getFileCalls).toBe(2);

    releaseRead?.();
    abort.abort();
    await expect(nextPoll).resolves.toMatchObject({ done: true });
  });
});
