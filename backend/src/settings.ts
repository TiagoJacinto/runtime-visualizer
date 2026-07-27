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

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

export type Settings = {
  /**
   * Absolute path to the folder whose files are exposed via
   * `GET /api/files`. Resolved relative to the directory that
   * contained the `settings.json` (or `startDir` if no file).
   *
   * NOTE: this is a dev-tool trust boundary, not a security one —
   * whoever can edit `settings.json` controls the endpoint.
   */
  readonly filesFolder: string
}

const SETTINGS_FILE = 'settings.json'
const DEFAULT_FILES_FOLDER = './target'

/** Parsed-shape guard; keeps the file loader honest. */
function isSettings(value: unknown): value is { filesFolder?: unknown } {
  return typeof value === 'object' && value !== null
}

/**
 * Walks up from `start` until it finds a `settings.json`, returning
 * its directory or `null` if none is found before hitting the fs
 * root.
 *
 * ponytail: O(depth) syscalls (one `existsSync` per ancestor) on
 * cache miss, O(1) afterwards. Fine for a process that loads its
 * config once; switch to a memoised lookup if `loadSettings` ever
 * runs per-request.
 */
function findSettingsDir(start: string): string | null {
  let dir = path.resolve(start)
  while (true) {
    if (fs.existsSync(path.join(dir, SETTINGS_FILE))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Default `startDir` — the directory containing this module. Using
 * `import.meta.dir` (not `process.cwd()`) makes the lookup robust
 * against workspaces and `bun --filter` changing cwd.
 */
function defaultStartDir(): string {
  return path.dirname(fileURLToPath(import.meta.url))
}

/**
 * Reads `settings.json` and returns the parsed {@link Settings}.
 * Tests pass `startDir` to point at a temp cwd without mutating
 * `process.cwd()`.
 */
export function loadSettings(startDir: string = defaultStartDir()): Settings {
  const foundDir = findSettingsDir(startDir)
  // No settings.json in the tree: fall back to `<startDir>/target`,
  // treating `startDir` as the user's project root for the purpose
  // of relative resolution.
  if (foundDir === null) {
    return { filesFolder: path.resolve(startDir, DEFAULT_FILES_FOLDER) }
  }

  const filePath = path.join(foundDir, SETTINGS_FILE)
  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (!isSettings(parsed)) {
    throw new Error(`Invalid ${SETTINGS_FILE}: expected an object`)
  }
  const folder = parsed.filesFolder
  if (folder === undefined) {
    return { filesFolder: path.resolve(foundDir, DEFAULT_FILES_FOLDER) }
  }
  if (typeof folder !== 'string' || folder.length === 0) {
    throw new Error(`Invalid ${SETTINGS_FILE}: filesFolder must be a non-empty string`)
  }
  return { filesFolder: path.resolve(foundDir, folder) }
}