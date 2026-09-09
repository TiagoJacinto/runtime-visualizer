import { RevisionKeySchema } from "@runtime-visualizer/contracts";
import type { RevisionKey } from "@runtime-visualizer/contracts";
import { z } from "zod";

export type SavedWorkspaceScope = RevisionKey & {
  importsVisible: boolean;
};
export interface WorkspacePreferences {
  load: () => SavedWorkspaceScope | undefined;
  save: (scope: SavedWorkspaceScope) => void;
}
const workspaceScopeSchema = RevisionKeySchema.extend({
  importsVisible: z.boolean(),
});
// SAFETY: this value is parsed immediately by workspaceScopeSchema.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const parse = (value: unknown): SavedWorkspaceScope | undefined => {
  const result = workspaceScopeSchema.safeParse(value);
  return result.success ? result.data : undefined;
};
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const browserStorage = (): StorageLike | undefined => {
  if (globalThis.localStorage === undefined) {
    return undefined;
  }
  return globalThis.localStorage;
};
export class LocalStorageWorkspacePreferences implements WorkspacePreferences {
  private readonly storage: StorageLike | undefined;
  private readonly key: string;

  constructor(
    storage: StorageLike | undefined = browserStorage(),
    key = "runtime-visualizer.workspace"
  ) {
    this.storage = storage;
    this.key = key;
  }
  load(): SavedWorkspaceScope | undefined {
    if (this.storage === undefined) {
      return undefined;
    }
    try {
      const raw = this.storage.getItem(this.key);
      if (raw === null) {
        return undefined;
      }
      const value = parse(JSON.parse(raw));
      if (value !== undefined) {
        return value;
      }
      this.storage.removeItem(this.key);
    } catch {
      this.storage.removeItem(this.key);
    }
    return undefined;
  }
  save(scope: SavedWorkspaceScope): void {
    if (this.storage === undefined) {
      return;
    }
    const value = parse(scope);
    if (value === undefined) {
      return;
    }
    this.storage.setItem(this.key, JSON.stringify(value));
  }
}
