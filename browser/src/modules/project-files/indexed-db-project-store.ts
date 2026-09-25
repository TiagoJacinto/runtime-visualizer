/* oxlint-disable avoid-new, prefer-add-event-listener, class-methods-use-this */

import { openBrowserWorkspaceDatabase } from "../browser-storage/indexed-db.ts";
import type {
  FileSystemDirectoryHandleLike,
  ProjectId,
  SavedProject,
  SavedProjectAccess,
} from "./index.ts";

interface ProjectRecord extends SavedProject {
  readonly handle: FileSystemDirectoryHandleLike;
}

const STORE = "projects";

export class IndexedDbProjectStore {
  async list(): Promise<readonly SavedProject[]> {
    const database = await openBrowserWorkspaceDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
      // SAFETY: the projects object store only contains ProjectRecord values.
      request.onsuccess = () => resolve((request.result as ProjectRecord[]).map(({ id, name }) => ({ id, name })));
      request.onerror = () => reject(request.error ?? new Error("Unable to list saved projects."));
    });
  }

  async get(projectId: ProjectId): Promise<SavedProjectAccess | undefined> {
    const database = await openBrowserWorkspaceDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(projectId);
      // SAFETY: records are written through put() with the ProjectRecord shape.
      request.onsuccess = () => resolve(request.result as ProjectRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("Unable to load saved project."));
    });
  }

  async put(project: SavedProjectAccess): Promise<void> {
    const database = await openBrowserWorkspaceDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readwrite").objectStore(STORE).put(project);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Unable to save project."));
    });
  }
}
