import { ProjectPermissionError } from "./project-permission-error.ts";
import type {
  FileSystemDirectoryHandleLike,
  FileSystemFileHandleLike,
  ProjectFiles,
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

export class FileSystemProjectFiles implements ProjectFiles {
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

  async listSourceFiles(projectId: ProjectId): Promise<readonly string[]> {
    const project = await this.projects.get(projectId);
    if (project === undefined) {
      throw new ProjectPermissionError("Project not found.");
    }
    await permission(project.handle);
    const files = new Map<string, FileSystemFileHandleLike>();
    await entries(project.handle, "", files);
    return sortSourcePaths([...files.keys()]);
  }

  async readSourceMap(projectId: ProjectId): Promise<SourceMap> {
    const project = await this.projects.get(projectId);
    if (project === undefined) {
      throw new ProjectPermissionError("Project not found.");
    }
    await permission(project.handle);
    const files = new Map<string, FileSystemFileHandleLike>();
    await entries(project.handle, "", files);
    const source = await Promise.all(
      [...files.entries()].map(async ([path, handle]) => {
        const file = await handle.getFile();
        const text = await file.text();
        return [path, text] as const;
      })
    );
    return Object.fromEntries(source);
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
