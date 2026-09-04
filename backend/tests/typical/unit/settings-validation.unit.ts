import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadSettings } from "../../../src/shared/infra/config/settings.ts";
import { parseBody } from "../../../src/shared/core/validation.ts";
import { HttpError } from "../../../src/shared/core/errors.ts";
import { z } from "zod";

describe("settings and request validation", () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("uses the target default when no settings file exists", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "runtime-settings-"));
    directory = dir;
    expect(loadSettings(dir).filesFolder).toBe(path.join(dir, "target"));
  });

  it("loads a relative folder and defaults when filesFolder is absent", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "runtime-settings-"));
    directory = dir;
    await writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify({ filesFolder: "saved" }),
    );
    expect(loadSettings(dir).filesFolder).toBe(path.join(dir, "saved"));
    await writeFile(path.join(dir, "settings.json"), JSON.stringify({}));
    expect(loadSettings(dir).filesFolder).toBe(path.join(dir, "target"));
  });

  it("rejects malformed settings and invalid request bodies", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "runtime-settings-"));
    directory = dir;
    await writeFile(path.join(dir, "settings.json"), JSON.stringify(null));
    expect(() => loadSettings(dir)).toThrow("expected an object");
    await writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify({ filesFolder: "" }),
    );
    expect(() => loadSettings(dir)).toThrow("non-empty string");
    await writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify({ filesFolder: 42 }),
    );
    expect(() => loadSettings(dir)).toThrow("non-empty string");
    expect(parseBody(z.object({ name: z.string() }), { name: "ok" })).toEqual({
      name: "ok",
    });
    expect(() => parseBody(z.object({ name: z.string() }), {})).toThrow(
      HttpError,
    );
    const schemaWithoutIssues = {
      safeParse: () => ({ success: false, error: { issues: [] } }),
    } as unknown as z.ZodType;
    expect(() => parseBody(schemaWithoutIssues, {})).toThrow(
      "Invalid request body.",
    );
  });
});
