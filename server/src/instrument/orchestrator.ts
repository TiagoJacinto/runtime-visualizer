/**
 * Orchestrates the instrument pipeline:
 *
 *   source (.ts)
 *     → instrument (CFG-driven send-call splicing)
 *     → compile (user-defined command, cached)
 *     → spawn (bun run <artifact>.js)
 *     → yield NDJSON events from the child's stdout
 *
 * The route handler drives this directly: each call returns an
 * async iterable of NDJSON-encoded events, plus the per-step
 * metadata it needs for the response header (cached? instrumented?
 * compiled?).
 *
 * ponytail: the orchestrator is the single place that owns the
 * side-effecting steps (read source, write instrumented.ts, spawn
 * compile, spawn run). Everything else is pure. Splitting it out
 * keeps the route handler to a thin streaming wrapper.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { instrument } from './instrument.ts'
import {
  cacheDirFor,
  cacheKey,
  readCachedJs,
  resolveCompileCommand,
  writeCachedArtifacts,
  type CachedArtifacts,
} from './cache.ts'
import { runCompile, spawnInstrumented, type InstrumentedRun } from './runner.ts'

export type OrchestratorOptions = {
  /** Absolute path to the entry `.ts` file. */
  readonly sourcePath: string
  /** Absolute project root (used to anchor the cache directory). */
  readonly projectRoot: string
  /** Relative entry name used as the cache sub-directory name. */
  readonly entry: string
  /**
   * User-defined compile command. Either a string template
   * (`"bun build {input} --outfile {output}"`) or an argv array.
   * Defaults to a `bun build` invocation that emits a node-target
   * bundle alongside the source.
   */
  readonly compileCommand?: string | ReadonlyArray<string>
}

export type OrchestratorResult = {
  /** Per-step outcome (for the response header). */
  readonly stages: {
    /** True if a cached `.instrumented.js` was reused. */
    readonly cached: boolean
    /** True if the source was instrumented in this call. */
    readonly instrumented: boolean
    /** True if the compile command was executed in this call. */
    readonly compiled: boolean
  }
  /** The spawned run; the caller streams `.lines` to the client. */
  readonly run: InstrumentedRun
}

/** Default compile command when the caller doesn't supply one. */
const DEFAULT_COMPILE_TEMPLATE: ReadonlyArray<string> = [
  'bun',
  'build',
  '{input}',
  '--target',
  'node',
  '--outfile',
  '{output}',
]

/**
 * Runs the full pipeline. The returned object exposes the spawned
 * run as an async iterable; the caller is responsible for streaming
 * it to the HTTP response and waiting on `run.exitCode` to know
 * when to close the connection.
 */
export async function orchestrate(
  options: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const source = await fs.readFile(options.sourcePath, 'utf8')
  const cmd = resolveCompileCommand(
    options.compileCommand ?? DEFAULT_COMPILE_TEMPLATE,
    '{input}',
    '{output}',
  )

  const dir = await cacheDirFor(options.projectRoot, options.entry)
  const key = cacheKey(source, cmd)

  // Fast path: source hash + compile command both match → reuse the
  // stored .js. No instrumentation, no compile, no temp files.
  const cachedJs = await readCachedJs(dir, key)
  if (cachedJs !== null) {
    const run = spawnInstrumented(cachedJs)
    return {
      stages: { cached: true, instrumented: false, compiled: false },
      run,
    }
  }

  // Slow path: instrument, write the .ts, compile to .js, cache both.
  const instrumentedTs = instrument(source, options.entry)
  // The compiled JS is a module — top-level statements run on import
  // but exported functions don't. Append a `run();` (or
  // `await run();` when there's top-level await) so spawning the
  // file actually executes the entry function.
  const invokable = withEntryCall(instrumentedTs)
  const tsPath = path.join(dir, `${key}.instrumented.ts`)
  const jsPath = path.join(dir, `${key}.instrumented.js`)
  await fs.writeFile(tsPath, invokable, 'utf8')

  const compileArgv = cmd.argv.map((tok) =>
    tok === '{input}' ? tsPath : tok === '{output}' ? jsPath : tok,
  )
  await runCompile(compileArgv, dir)
  await writeCachedArtifacts(dir, key, invokable, await fs.readFile(jsPath, 'utf8'), source, cmd)

  const run = spawnInstrumented(jsPath)
  return {
    stages: { cached: false, instrumented: true, compiled: true },
    run,
  }
}

export type { CachedArtifacts }

/**
 * Appends a call to the first exported function so the compiled
 * module actually executes when spawned as a script.
 *
 * Ponytail: this is a best-effort heuristic. Files with no
 * exported function (top-level side effects only) are left alone;
 * files with multiple exported functions only invoke the first
 * one. If we ever need a configurable entry point, plumb an
 * `entryFn` field through the route body.
 */
function withEntryCall(instrumentedTs: string): string {
  const match = instrumentedTs.match(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)
  if (match === null) return instrumentedTs
  const fnName = match[1]
  if (fnName === undefined) return instrumentedTs
  const isAsync = /\bexport\s+async\s+function\b/.test(match[0])
  return `${instrumentedTs}\n${isAsync ? 'await' : ''} ${fnName}();\n`
}