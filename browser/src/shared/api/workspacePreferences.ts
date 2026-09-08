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

export class LocalStorageWorkspacePreferences implements WorkspacePreferences {
  constructor(
    private readonly storage: StorageLike | undefined = browserStorage(),
    private readonly key = "runtime-visualizer.workspace",
  ) {}

  load(): SavedWorkspaceScope | undefined {
    if (this.storage === undefined) return undefined;
    try {
      const raw = this.storage.getItem(this.key);
      if (raw === null) return undefined;
      const value = parse(JSON.parse(raw));
      if (value !== undefined) return value;
      this.storage.removeItem(this.key);
    } catch {
      this.storage.removeItem(this.key);
    }
    return undefined;
  }

  save(scope: SavedWorkspaceScope): void {
    if (this.storage === undefined) return;
    const value = parse(scope);
    if (value === undefined) return;
    this.storage.setItem(this.key, JSON.stringify(value));
  }
}

export class MemoryWorkspacePreferences implements WorkspacePreferences {
  private value: SavedWorkspaceScope | undefined;

  constructor(initial?: SavedWorkspaceScope) {
    this.value = parse(initial);
  }

  load(): SavedWorkspaceScope | undefined {
    return this.value;
  }

  save(scope: SavedWorkspaceScope): void {
    this.value = parse(scope);
  }
}
