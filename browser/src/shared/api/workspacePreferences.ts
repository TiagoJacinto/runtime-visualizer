import {
  RevisionKeySchema,
  type RevisionKey,
} from "@runtime-visualizer/contracts";

export type SavedWorkspaceScope = RevisionKey & { importsVisible: boolean };

export type WorkspacePreferences = {
  load(): SavedWorkspaceScope | undefined;
  save(scope: SavedWorkspaceScope): void;
};

function parse(value: unknown): SavedWorkspaceScope | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.importsVisible !== "boolean") return undefined;
  const scope = RevisionKeySchema.safeParse(item);
  if (!scope.success) return undefined;
  return { ...scope.data, importsVisible: item.importsVisible };
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): StorageLike | undefined {
  if (typeof globalThis.localStorage === "undefined") return undefined;
  return globalThis.localStorage;
}

export function createLocalStorageWorkspacePreferences(
  storage: StorageLike | undefined = browserStorage(),
  key = "runtime-visualizer.workspace",
): WorkspacePreferences {
  return {
    load() {
      if (storage === undefined) return undefined;
      try {
        const raw = storage.getItem(key);
        if (raw === null) return undefined;
        const value = parse(JSON.parse(raw));
        if (value !== undefined) return value;
        storage.removeItem(key);
      } catch {
        storage.removeItem(key);
      }
      return undefined;
    },
    save(scope) {
      if (storage === undefined) return;
      const value = parse(scope);
      if (value === undefined) return;
      storage.setItem(key, JSON.stringify(value));
    },
  };
}

export function createMemoryWorkspacePreferences(
  initial?: SavedWorkspaceScope,
): WorkspacePreferences {
  let value = parse(initial);
  return {
    load: () => value,
    save: (scope) => {
      value = parse(scope);
    },
  };
}
