/**
 * Child-process orchestration for the instrument pipeline.
 *
 * Two responsibilities:
 *
 *   1. {@link runCompile} — runs the user-defined compile command
 *      to produce `*.instrumented.js` from `*.instrumented.ts`.
 *   2. {@link spawnInstrumented} — spawns the compiled artifact and
 *      yields its stdout line-by-line as an async iterable.
 *
 * Errors are surfaced as typed {@link CompileError} subclass so the
 * route handler can return the right HTTP status. Spawn failures
 * propagate as raw errors from `node:child_process`.
 *
 * ponytail: we only capture stdout (the instrumented code is
 * supposed to emit its events there). stderr is captured but only
 * surfaced on non-zero exit — there's no point buffering it on the
 * happy path since the visualizer doesn't care.
 */

import { spawn } from 'node:child_process'

export class CompileError extends Error {
  readonly status = 422 as const
  readonly exitCode: number
  readonly stderr: string

  constructor(exitCode: number, stderr: string) {
    super(`Compile failed (exit ${exitCode}): ${stderr.trim() || '<no stderr>'}`)
    this.name = 'CompileError'
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

export type CompileResult = {
  /** Absolute path to the JS file the command produced. */
  readonly jsPath: string
}

/**
 * Runs the compile command and returns once the `.js` is on disk.
 * The caller is responsible for setting up the `{input}` /
 * `{output}` substitution via {@link resolveCompileCommand}.
 */
export function runCompile(argv: ReadonlyArray<string>, cwd: string): Promise<CompileResult> {
  return new Promise((resolveP, rejectP) => {
    const [cmd, ...args] = argv
    if (cmd === undefined || cmd.length === 0) {
      rejectP(new Error('Compile command had no executable'))
      return
    }
    const proc = spawn(cmd, args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    proc.on('error', (err) => rejectP(err))
    proc.on('close', (code) => {
      if (code === 0) {
        // Convention: last argv token is the output path (we
        // substituted it ourselves in resolveCompileCommand).
        const last = argv[argv.length - 1]
        if (last === undefined || last.length === 0) {
          rejectP(new Error('Compile command had no output path'))
          return
        }
        resolveP({ jsPath: last })
      } else {
        rejectP(new CompileError(code ?? -1, stderr))
      }
    })
  })
}

/** Yields NDJSON lines from a child process's stdout. */
export type InstrumentedRun = {
  readonly lines: AsyncIterable<string>
  readonly exitCode: Promise<number>
  readonly stderr: Promise<string>
}

/**
 * Spawns the instrumented JS file. Stdout is split on `\n` and each
 * non-empty line is yielded in order. The process is killed if the
 * consumer drops the iterator before exit (see the
 * `return`/cleanup branch below).
 */
export function spawnInstrumented(jsPath: string): InstrumentedRun {
  const proc = spawn('bun', ['run', jsPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const stdout = proc.stdout
  stdout.setEncoding('utf8')

  let stderr = ''
  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })

  const exitCode = new Promise<number>((resolveP, rejectP) => {
    proc.on('error', (err) => rejectP(err))
    proc.on('close', (code) => resolveP(code ?? -1))
  })

  // Buffer-style line splitter: handles CR, LF, and CRLF.
  const lines = (async function* (): AsyncIterable<string> {
    let pending = ''
    try {
      for await (const chunk of stdout) {
        pending += chunk
        let idx = pending.indexOf('\n')
        while (idx !== -1) {
          let line = pending.slice(0, idx)
          if (line.endsWith('\r')) line = line.slice(0, -1)
          if (line.length > 0) yield line
          pending = pending.slice(idx + 1)
          idx = pending.indexOf('\n')
        }
      }
      if (pending.length > 0) yield pending
    } finally {
      // If the consumer bails out (e.g. client disconnect), don't
      // leak the child — kill it and let it reap on its own.
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill('SIGTERM')
      }
    }
  })()

  const stderrDone = (async () => {
    await new Promise<void>((resolveP) => {
      proc.stderr.on('end', () => resolveP())
      proc.stderr.on('close', () => resolveP())
    })
    return stderr
  })()

  return { lines, exitCode, stderr: stderrDone }
}