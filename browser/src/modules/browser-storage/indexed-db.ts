/* oxlint-disable avoid-new, prefer-add-event-listener */

const DATABASE = "runtime-visualizer";
const VERSION = 2;

const ensureStore = (
  database: IDBDatabase,
  name: string,
  options: IDBObjectStoreParameters
): void => {
  if (!database.objectStoreNames.contains(name)) {
    database.createObjectStore(name, options);
  }
};

export const openBrowserWorkspaceDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      ensureStore(database, "projects", { keyPath: "id" });
      ensureStore(database, "sources", { keyPath: "hash" });
      ensureStore(database, "revisions", {
        keyPath: ["projectId", "file", "procedureId", "revision"],
      });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Unable to open browser workspace storage."))
    );
  });
