import type {
  SavedWorkspaceScope,
  WorkspacePreferences,
} from "./workspace-preferences";

export class MemoryWorkspacePreferences implements WorkspacePreferences {
  private value: SavedWorkspaceScope | undefined;

  constructor(initial?: SavedWorkspaceScope) {
    this.value = initial;
  }

  load(): SavedWorkspaceScope | undefined {
    return this.value;
  }

  save(scope: SavedWorkspaceScope): void {
    this.value = scope;
  }
}
