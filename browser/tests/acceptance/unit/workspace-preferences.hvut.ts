import { describe, expect, it } from "vitest";
import {
  LocalStorageWorkspacePreferences,
  MemoryWorkspacePreferences,
} from "../../../src/shared/api/workspacePreferences";

const scope = {
  file: "main.ts",
  procedureId: "top-level",
  revision: "revision-1",
  importsVisible: true,
};

describe("workspace preferences", () => {
  it("round-trips valid values in memory", () => {
    const preferences = new MemoryWorkspacePreferences();
    expect(preferences.load()).toBeUndefined();
    preferences.save(scope);
    expect(preferences.load()).toEqual(scope);
  });

  it("round-trips valid values in local storage", () => {
    const storage = new Map<string, string>();
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    const preferences = new LocalStorageWorkspacePreferences(
      fakeStorage,
      "workspace",
    );

    preferences.save(scope);

    expect(preferences.load()).toEqual(scope);
  });

  it("removes malformed local storage values", () => {
    const storage = new Map([["workspace", "not-json"]]);
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    const preferences = new LocalStorageWorkspacePreferences(
      fakeStorage,
      "workspace",
    );

    expect(preferences.load()).toBeUndefined();
    expect(storage.has("workspace")).toBe(false);
  });

  it("ignores invalid values when saving", () => {
    const storage = new Map<string, string>();
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    const preferences = new LocalStorageWorkspacePreferences(
      fakeStorage,
      "workspace",
    );

    preferences.save({ ...scope, importsVisible: "yes" as never });

    expect(storage.has("workspace")).toBe(false);
  });
});
