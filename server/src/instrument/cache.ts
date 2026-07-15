/**
 * Source-hash cache for instrumented artifacts.
 *
 * The spec asks for an optimisation: "if file1.ts doesn't change we
 * can skip instrumentation and compilation and just run stored
 * file1.instrumented.js". The cheapest correct way to express that
 * is to hash the source bytes and key the cache directory on that
 * hash — content-addressed, so any change to the source invalidates
 * the entry without us having to track mtimes (which a build tool
 * can legitimately preserve across re-saves).
 *
 * Cache layout under `<projectRoot>/.instrumented/<entry>/`:
 *
 *   <sha>.source.ts    ← the original source, snapshotted at build time
 *   <sha>.instrumented.ts
 *   <sha>.instrumented.js
 *   <sha>.meta.json    ← { compileCommand, instrumentedAt }
 *
 * ponytail: content-only hashing means an unrelated change to the
 * compile command invalidates the cache too — we treat the command
 * as part of the key (see {@link cacheKey}). That keeps a stale
 * `.instrumented.js` from being run after the user changes the
 * compile flags.
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/** What we ultimately hand back to the route handler. */
export type CachedArtifacts = {
  /** Absolute path to the instrumented JS ready to be spawned. */
  readonly jsPath: string
  /** Absolute path to the instrumented TS source (kept for debugging). */
  readonly tsPath: string
  /** Whether this call hit the cache (`true`) or rebuilt (`false`). */
  readonly cached: boolean
}

/** A compile command template with `{input}` / `{output}` placeholders. */
export type CompileCommand = {
  /** Tokens of the command, e.g. `["bun", "build", "{input}", "--outfile", "{output}"]`. */
  readonly argv: ReadonlyArray<string>
}

/** Build a CompileCommand from a string or argv, substituting `{input}` / `{output}`. */
export function resolveCompileCommand(
  template: string | ReadonlyArray<string>,
  input: string,
  output: string,
): CompileCommand {
  const tokens = Array.isArray(template) ? template : tokeniseShell(template)
  const argv = tokens.map((t) =>
    t === '{input}' ? input : t === '{output}' ? output : t,
  )
  return { argv }
}

/**
 * Tiny shell-style splitter. Good enough for the `bun build ...`
 * shapes the spec expects; doesn't honour quotes-within-quotes or
 * backslash escapes. Callers who need that should pass an argv
 * array directly.
 */
function tokeniseShell(cmd: string): ReadonlyArray<string> {
  if (Array.isArray(cmd)) return cmd
  return cmd
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Returns the on-disk cache directory for `entry`, creating it if
 * needed. `<projectRoot>/.instrumented/<entry>/`
 */
export async function cacheDirFor(projectRoot: string, entry: string): Promise<string> {
  const dir = path.join(projectRoot, '.instrumented', entry)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

/**
 * Builds a content-only cache key from the source bytes and the
 * compile command. The command is hashed too so changing the flags
 * forces a rebuild.
 */
export function cacheKey(source: string, compileCommand: CompileCommand): string {
  const h = crypto.createHash('sha256')
  h.update(source)
  h.update('\0')
  h.update(compileCommand.argv.join(' '))
  return h.digest('hex').slice(0, 16)
}

/** Reads a previously-cached JS artifact if one exists for `key`. */
export async function readCachedJs(cacheDir: string, key: string): Promise<string | null> {
  const jsPath = path.join(cacheDir, `${key}.instrumented.js`)
  try {
    await fs.access(jsPath)
    return jsPath
  } catch {
    return null
  }
}

/** Writes the instrumented TS + compiled JS + meta into the cache directory. */
export async function writeCachedArtifacts(
  cacheDir: string,
  key: string,
  instrumentedTs: string,
  compiledJs: string,
  source: string,
  compileCommand: CompileCommand,
): Promise<{ tsPath: string; jsPath: string }> {
  const tsPath = path.join(cacheDir, `${key}.instrumented.ts`)
  const jsPath = path.join(cacheDir, `${key}.instrumented.js`)
  const sourcePath = path.join(cacheDir, `${key}.source.ts`)
  const metaPath = path.join(cacheDir, `${key}.meta.json`)
  await Promise.all([
    fs.writeFile(tsPath, instrumentedTs, 'utf8'),
    fs.writeFile(jsPath, compiledJs, 'utf8'),
    fs.writeFile(sourcePath, source, 'utf8'),
    fs.writeFile(
      metaPath,
      JSON.stringify({ compileCommand: compileCommand.argv, instrumentedAt: new Date().toISOString() }),
      'utf8',
    ),
  ])
  return { tsPath, jsPath }
}