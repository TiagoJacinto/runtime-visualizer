/**
 * Loads the project's `settings.json` and exposes its `filesFolder`
 * value.
 *
 * Lookup walks up the directory tree from `startDir` (defaults to
 * `import.meta.dir`, i.e. this file's location) until it finds a
 * `settings.json`. The cwd is unreliable because the server is
 * launched as a workspace filter (`bun --filter … start`) which
 * changes cwd into `server/`. Walking up from `import.meta.dir`
 * finds the project-root settings file regardless of cwd.
 *
 * Missing file → defaults to `<startDir>/../target`. Malformed file
 * → throws so the user notices immediately.
 */
import * as fs from "node:fs";
import path from "node:path";

import { z } from "zod";

export interface Settings {
  /**
   * Absolute path to the folder whose files are exposed via
   * `GET /api/files`. Resolved relative to the directory that
   * contained the `settings.json` (or `startDir` if no file).
   *
   * NOTE: this is a dev-tool trust boundary, not a security one —
   * whoever can edit `settings.json` controls the endpoint.
   */
  readonly filesFolder: string;
}
const SETTINGS_FILE = "settings.json";
const DEFAULT_FILES_FOLDER = "./target";
const settingsSchema = z
  .object({ filesFolder: z.string().min(1).optional() })
  .strict();
const findSettingsDir = (start: string): string | null => {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, SETTINGS_FILE))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
};
const defaultStartDir = (): string => import.meta.dirname;
/**
 * Reads `settings.json` and returns the parsed {@link Settings}.
 * Tests pass `startDir` to point at a temp cwd without mutating
 * `process.cwd()`.
 */
export const loadSettings = (
  startDir: string = defaultStartDir()
): Settings => {
  const foundDir = findSettingsDir(startDir);
  // No settings.json in the tree: fall back to `<startDir>/target`,
  // treating `startDir` as the user's project root for the purpose
  // of relative resolution.
  if (foundDir === null) {
    return { filesFolder: path.resolve(startDir, DEFAULT_FILES_FOLDER) };
  }
  const filePath = path.join(foundDir, SETTINGS_FILE);
  const raw = fs.readFileSync(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid ${SETTINGS_FILE}: malformed JSON`, {
      cause: error,
    });
  }
  if (parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid ${SETTINGS_FILE}: expected an object`);
  }
  const result = settingsSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid ${SETTINGS_FILE}: filesFolder must be a non-empty string`
    );
  }
  const folder = result.data.filesFolder;
  return {
    filesFolder: path.resolve(foundDir, folder ?? DEFAULT_FILES_FOLDER),
  };
};
