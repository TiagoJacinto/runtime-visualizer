import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserProjects } from "../../../src/modules/project-files/browser-projects.ts";
import { FileSystemProjectFiles } from "../../../src/modules/project-files/file-system-project-files.ts";
import type {
  FileSystemDirectoryHandleLike,
  FileSystemHandleLike,
  FileSystemFileHandleLike,
  SavedProjectAccess,
} from "../../../src/modules/project-files/index.ts";
import {
  isSupportedSourcePath,
  sortSourcePaths,
} from "../../../src/modules/project-files/index.ts";
import { ProjectPermissionError } from "../../../src/modules/project-files/project-permission-error.ts";

const directoryIdentities = new WeakMap<FileSystemDirectoryHandleLike, symbol>();

const iterateDirectoryEntries = async function* iterateDirectoryEntries(
  children: readonly (readonly [string, FileSystemHandleLike])[]
): AsyncIterableIterator<readonly [string, FileSystemHandleLike]> {
  for (const entry of children) {
    yield entry;
  }
};

const directory = (
  name: string,
  children: readonly (readonly [string, FileSystemHandleLike])[] = [],
  identity = Symbol(name),
  permission: PermissionState = "granted"
): FileSystemDirectoryHandleLike => {
  const handle: FileSystemDirectoryHandleLike = {
    entries: () => iterateDirectoryEntries(children),
    isSameEntry: (other) =>
      Promise.resolve(directoryIdentities.get(other) === identity),
    kind: "directory",
    name,
    queryPermission: () => Promise.resolve(permission),
    requestPermission: () => Promise.resolve(permission),
  };
  directoryIdentities.set(handle, identity);
  return handle;
};

const sourceFile = (name: string, text: string): FileSystemFileHandleLike => ({
  getFile: () => Promise.resolve(Object.assign(new Blob([text]), { lastModified: 1 })),
  kind: "file",
  name,
});

const memoryStore = (initial: readonly SavedProjectAccess[] = []) => {
  const saved = new Map(initial.map((project) => [project.id, project]));
  return {
    get: (id: string) => Promise.resolve(saved.get(id)),
    list: () =>
      Promise.resolve([...saved.values()].map(({ id, name }) => ({ id, name }))),
    put: (project: SavedProjectAccess) => {
      saved.set(project.id, project);
      return Promise.resolve();
    },
  };
};

const setPicker = (
  picker?: () => Promise<FileSystemDirectoryHandleLike>
): void => {
  vi.stubGlobal(
    "window",
    picker === undefined ? {} : { showDirectoryPicker: picker }
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser project files", () => {
  it("accepts TypeScript source files and excludes other files", () => {
    expect(isSupportedSourcePath("src/main.ts")).toBe(true);
    expect(isSupportedSourcePath("src/view.TSX")).toBe(true);
    expect(isSupportedSourcePath("README.md")).toBe(false);
  });

  it("sorts paths for deterministic project trees", () => {
    expect(sortSourcePaths(["z.ts", "src/a.ts", "src/b.ts"])).toEqual([
      "src/a.ts",
      "src/b.ts",
      "z.ts",
    ]);
  });

  it("reports when folder selection is unsupported", async () => {
    setPicker();
    const projects = new BrowserProjects(memoryStore());

    await expect(projects.add()).resolves.toEqual({ status: "unsupported" });
  });

  it("reuses a saved project when the selected handle identifies the same folder", async () => {
    const identity = Symbol("same directory entry");
    const savedHandle = directory("Old name", [], identity);
    const pickedHandle = directory("New name", [], identity);
    const store = memoryStore([
      { handle: savedHandle, id: "saved-project", name: "Old name" },
    ]);
    setPicker(() => Promise.resolve(pickedHandle));

    const result = await new BrowserProjects(store).add();

    expect(result).toMatchObject({
      project: { handle: pickedHandle, id: "saved-project", name: "New name" },
      status: "opened",
    });
  });

  it("keeps a project's internal identity when its folder is reselected", async () => {
    const previous = directory("Old name");
    const replacement = directory("Current name");
    const store = memoryStore([
      { handle: previous, id: "saved-project", name: "Old name" },
    ]);
    setPicker(() => Promise.resolve(replacement));

    const result = await new BrowserProjects(store).reselect("saved-project");

    expect(result).toMatchObject({
      project: { id: "saved-project", name: "Current name" },
      status: "opened",
    });
    expect(await store.get("saved-project")).toMatchObject({
      handle: replacement,
    });
  });

  it("lists nested TypeScript files and reads their source", async () => {
    const handle = directory("project", [
      [
        "src",
        directory("src", [
          ["main.ts", sourceFile("main.ts", "export const answer = 42;")],
          ["view.tsx", sourceFile("view.tsx", "export const View = () => null;")],
          ["notes.md", sourceFile("notes.md", "not source")],
        ]),
      ],
      ["README.md", sourceFile("README.md", "not source")],
    ]);
    const files = new FileSystemProjectFiles({
      get: (id) =>
        Promise.resolve(id === "project-1" ? { handle } : undefined),
    });

    await expect(files.listSourceFiles("project-1")).resolves.toEqual([
      "src/main.ts",
      "src/view.tsx",
    ]);
    await expect(files.readSourceMap("project-1")).resolves.toEqual({
      "src/main.ts": "export const answer = 42;",
      "src/view.tsx": "export const View = () => null;",
    });
  });

  it("does not read a project when its folder permission is denied", async () => {
    const handle = directory("private", [], Symbol("private"), "denied");
    const files = new FileSystemProjectFiles({
      get: () => Promise.resolve({ handle }),
    });

    await expect(files.listSourceFiles("private-project")).rejects.toBeInstanceOf(
      ProjectPermissionError
    );
  });
});
