import { ProjectPermissionError } from "./project-permission-error.ts";
import type {
  FileSystemDirectoryHandleLike,
  FileSystemFileHandleLike,
  ProjectFileChange,
  ProjectFileChangeSource,
  ProjectFiles,
  ProjectFilesWatchEvent,
  ProjectId,
  SourceMap,
} from "./index.ts";
import { isSupportedSourcePath, sortSourcePaths } from "./index.ts";

const permission = async (
  handle: FileSystemDirectoryHandleLike
): Promise<void> => {
  const state = await handle.queryPermission?.({ mode: "read" });
  if (state === "granted" || state === undefined) {
    return;
  }
  const requested = await handle.requestPermission?.({ mode: "read" });
  if (requested !== "granted") {
    throw new ProjectPermissionError();
  }
};

const entries = async (
  directory: FileSystemDirectoryHandleLike,
  prefix: string,
  result: Map<string, FileSystemFileHandleLike>
): Promise<void> => {
  for await (const [name, handle] of directory.entries()) {
    const path = prefix === "" ? name : `${prefix}/${name}`;
    if (handle.kind === "directory") {
      if (!name.startsWith(".")) {
        await entries(handle, path, result);
      }
    } else if (isSupportedSourcePath(path)) {
      result.set(path, handle);
    }
  }
};

const POLL_INTERVAL_MS = 250;

const waitForNextPoll = (signal: AbortSignal): Promise<void> =>
  // SAFETY: Promise adapts timer and AbortSignal completion into one awaitable poll delay.
  // oxlint-disable-next-line promise/avoid-new
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const abort = (): void => resolve();
    setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, POLL_INTERVAL_MS);
    signal.addEventListener("abort", abort, { once: true });
  });

interface ObservedFile {
  readonly file: Blob & { readonly lastModified: number; readonly size: number };
  readonly lastModified: number;
  readonly size: number;
}

const inspectSourceFiles = async (
  handles: Map<string, FileSystemFileHandleLike>
): Promise<Map<string, ObservedFile>> => {
  const observed = new Map<string, ObservedFile>();
  for (const path of sortSourcePaths([...handles.keys()])) {
    const handle = handles.get(path);
    if (handle === undefined) {
      continue;
    }
    // This traversal is intentionally serial to avoid overlapping handle reads.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const file = await handle.getFile();
    observed.set(path, {
      file,
      lastModified: file.lastModified,
      size: file.size,
    });
  }
  return observed;
};

export class FileSystemProjectFiles
  implements ProjectFiles, ProjectFileChangeSource
{
  private readonly projects: {
    get: (projectId: ProjectId) => Promise<
      { readonly handle: FileSystemDirectoryHandleLike } | undefined
    >;
  };

  constructor(
    projects: {
      get: (projectId: ProjectId) => Promise<
        { readonly handle: FileSystemDirectoryHandleLike } | undefined
      >;
    }
  ) {
    this.projects = projects;
  }

  private async sourceFileHandles(
    projectId: ProjectId
  ): Promise<Map<string, FileSystemFileHandleLike>> {
    const project = await this.projects.get(projectId);
    if (project === undefined) {
      throw new ProjectPermissionError("Project not found.");
    }
    await permission(project.handle);
    const files = new Map<string, FileSystemFileHandleLike>();
    await entries(project.handle, "", files);
    return files;
  }

  async listSourceFiles(projectId: ProjectId): Promise<readonly string[]> {
    const files = await this.sourceFileHandles(projectId);
    return sortSourcePaths([...files.keys()]);
  }

  async readSourceMap(projectId: ProjectId): Promise<SourceMap> {
    const files = await this.sourceFileHandles(projectId);
    const source = await Promise.all(
      [...files.entries()].map(async ([path, handle]) => {
        const file = await handle.getFile();
        const text = await file.text();
        return [path, text] as const;
      })
    );
    return Object.fromEntries(source);
  }

  async *watchChanges(
    projectId: ProjectId,
    signal: AbortSignal
  ): AsyncIterable<ProjectFilesWatchEvent> {
    let previous = await inspectSourceFiles(
      await this.sourceFileHandles(projectId)
    );
    if (signal.aborted) {
      return;
    }
    yield { type: "ready" };

    while (!signal.aborted) {
      // The next poll must wait until this one completes to avoid overlapping scans.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await waitForNextPoll(signal);
      if (signal.aborted) {
        return;
      }
      // SAFETY: polling scans must remain serial; overlapping scans could reorder observations.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const handles = await this.sourceFileHandles(projectId);
      // SAFETY: finish the current cycle before starting the next observation.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const current = await inspectSourceFiles(handles);
      const changes: ProjectFileChange[] = [];
      for (const [path, observed] of current) {
        const prior = previous.get(path);
        if (
          prior !== undefined &&
          prior.size === observed.size &&
          prior.lastModified === observed.lastModified
        ) {
          continue;
        }
        // Read changed files serially so observations stay ordered within a poll.
        // oxlint-disable-next-line eslint/no-await-in-loop
        const source = await observed.file.text();
        changes.push({
          change: prior === undefined ? "added" : "modified",
          file: path,
          source,
        });
      }
      for (const path of previous.keys()) {
        if (!current.has(path)) {
          changes.push({ change: "deleted", file: path });
        }
      }
      previous = current;
      if (!signal.aborted && changes.length > 0) {
        yield { changes, type: "changes" };
      }
    }
  }

  async readSource(projectId: ProjectId, path: string): Promise<string> {
    const source = await this.readSourceMap(projectId);
    const text = source[path];
    if (text === undefined) {
      throw new Error(`Source file not found: ${path}`);
    }
    return text;
  }
}
