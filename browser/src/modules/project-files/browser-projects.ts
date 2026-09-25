import { ProjectPermissionError } from "./project-permission-error.ts";
import type {
  AddProjectResult,
  BrowserProjectsPort,
  FileSystemDirectoryHandleLike,
  ProjectId,
  SavedProjectAccess,
  SavedProject,
} from "./index.ts";

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike>;
  }
}

const picker = (): (() => Promise<FileSystemDirectoryHandleLike>) | undefined =>
  globalThis.window?.showDirectoryPicker;

const projectId = (): ProjectId => {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return globalThis.crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export interface ProjectStore {
  list: () => Promise<readonly SavedProject[]>;
  get: (id: ProjectId) => Promise<SavedProjectAccess | undefined>;
  put: (project: SavedProjectAccess) => Promise<void>;
}

export class BrowserProjects implements BrowserProjectsPort {
  private readonly store: ProjectStore;

  constructor(store: ProjectStore) {
    this.store = store;
  }

  list(): Promise<readonly SavedProject[]> {
    return this.store.list();
  }

  async add(): Promise<AddProjectResult> {
    const open = picker();
    if (open === undefined) {
      return { status: "unsupported" };
    }
    let handle: FileSystemDirectoryHandleLike;
    try {
      handle = await open();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { status: "cancelled" };
      }
      throw error;
    }
    const existing = await this.findExisting(handle);
    const project: SavedProjectAccess = existing === undefined
      ? { handle, id: projectId(), name: handle.name }
      : { ...existing, handle, name: handle.name };
    await this.store.put(project);
    return { project, status: "opened" };
  }

  async reselect(id: ProjectId): Promise<AddProjectResult> {
    const open = picker();
    if (open === undefined) {
      return { status: "unsupported" };
    }
    const previous = await this.store.get(id);
    if (previous === undefined) {
      throw new ProjectPermissionError("Project not found.");
    }
    let handle: FileSystemDirectoryHandleLike;
    try {
      handle = await open();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { status: "cancelled" };
      }
      throw error;
    }
    const project = { ...previous, handle, name: handle.name };
    await this.store.put(project);
    return { project, status: "opened" };
  }

  get(id: ProjectId): Promise<SavedProjectAccess | undefined> {
    return this.store.get(id);
  }

  private async findExisting(
    handle: FileSystemDirectoryHandleLike
  ): Promise<SavedProjectAccess | undefined> {
    const projects = await this.store.list();
    const savedProjects = await Promise.all(
      projects.map((project) => this.store.get(project.id))
    );
    const matches = await Promise.all(
      savedProjects.map((saved) => saved?.handle.isSameEntry?.(handle))
    );
    return savedProjects.find((_saved, index) => matches[index] === true);
  }
}

export { UnsupportedFilePickerError } from "./unsupported-file-picker-error.ts";
