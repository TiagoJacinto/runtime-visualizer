export type ProjectId = string;

export interface SourceMap {
  readonly [path: string]: string;
}

export interface ProjectFile {
  readonly path: string;
  readonly kind: "file";
}

export interface ProjectFiles {
  listSourceFiles: (projectId: ProjectId) => Promise<readonly string[]>;
  readSourceMap: (projectId: ProjectId) => Promise<SourceMap>;
  readSource: (projectId: ProjectId, path: string) => Promise<string>;
}

export interface SavedProject {
  readonly id: ProjectId;
  readonly name: string;
}

export interface SavedProjectAccess extends SavedProject {
  readonly handle: FileSystemDirectoryHandleLike;
}

export type AddProjectResult =
  | { readonly status: "opened"; readonly project: SavedProject }
  | { readonly status: "unsupported" }
  | { readonly status: "cancelled" }
  | { readonly status: "permission-denied" };

export interface BrowserProjectsPort {
  list: () => Promise<readonly SavedProject[]>;
  add: () => Promise<AddProjectResult>;
  reselect: (projectId: ProjectId) => Promise<AddProjectResult>;
  get: (projectId: ProjectId) => Promise<SavedProjectAccess | undefined>;
}

export interface FileSystemFileHandleLike {
  readonly kind: "file";
  readonly name: string;
  getFile: () => Promise<Blob & { readonly lastModified: number; readonly size: number }>;
}

export interface FileSystemDirectoryHandleLike {
  readonly kind: "directory";
  readonly name: string;
  entries: () => AsyncIterableIterator<readonly [string, FileSystemHandleLike]>;
  isSameEntry?: (other: FileSystemDirectoryHandleLike) => Promise<boolean>;
  queryPermission?: (descriptor?: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode: "read" }) => Promise<PermissionState>;
}

export type FileSystemHandleLike =
  | FileSystemFileHandleLike
  | FileSystemDirectoryHandleLike;

export { UnsupportedFilePickerError } from "./unsupported-file-picker-error.ts";
export { ProjectPermissionError } from "./project-permission-error.ts";

export const isSupportedSourcePath = (path: string): boolean =>
  /\.(?:ts|tsx)$/iu.test(path);

export const sortSourcePaths = (
  paths: readonly string[]
): readonly string[] => paths.toSorted((a, b) => a.localeCompare(b));
