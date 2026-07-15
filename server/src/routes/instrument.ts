/**
 * Instrument endpoint:
 *
 *   POST /api/instrument/run
 *     body: { entry: string, compileCommand?: string | string[] }
 *     → streams NDJSON events from the instrumented target as
 *       `Transfer-Encoding: chunked`. The response header
 *       `X-Instrument-Stages` is a JSON-encoded summary of the
 *       pipeline stages (cached? instrumented? compiled?) so the
 *       client can tell whether the run was a cache hit without
 *       having to parse the body.
 *
 * Pipeline (also documented in `orchestrator.ts`):
 *
 *   1. Resolve `<projectRoot>/<entry>.ts`. 404 if missing,
 *      400 if the entry escapes the root or isn't a `.ts` file.
 *   2. Read the source and check the content-hash cache.
 *      Hit → skip instrument + compile, spawn the cached `.js`.
 *   3. Miss → instrument via the CFG, write `.instrumented.ts`,
 *      run the user-supplied compile command, write the cache.
 *   4. Spawn the artifact and stream its stdout NDJSON events
 *      back to the client.
 *
 * Forwarding to the visualizer: the response IS the forwarding
 * channel. The React visualizer consumes the NDJSON stream from a
 * `fetch()` against this endpoint, so no extra WebSocket round-trip
 * is needed. The instrumented program writes events to stdout via
 * the prelude added in `instrument.ts`.
 */

import type { FastifyPluginAsync } from 'fastify'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { HttpError } from '../errors.ts'
import { orchestrate } from '../instrument/orchestrator.ts'

type InstrumentRequestBody = {
  readonly entry?: unknown
  readonly compileCommand?: unknown
}

export type InstrumentRoutesOptions = {
  /** Project root used when the body doesn't supply one. */
  readonly projectRoot?: string
}

const PROJECT_ROOT_DEFAULT = path.join(process.cwd(), 'target')
const MAX_SOURCE_BYTES = 200_000

/** Coerce a parsed JSON body to a typed record. */
function coerceBody(req: { body: unknown }): InstrumentRequestBody {
  return (
    typeof req.body === 'object' && req.body !== null
      ? (req.body as InstrumentRequestBody)
      : ({} as InstrumentRequestBody)
  )
}

function normaliseRelative(input: string): string {
  const trimmed = input.replace(/^\.\//, '')
  return trimmed.split(path.sep).join('/')
}

function isInsideRoot(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

const instrumentRoutes: FastifyPluginAsync<InstrumentRoutesOptions> = async (app, options) => {
  app.post('/run', async (req, reply) => {
    const body = coerceBody(req)

    if (typeof body.entry !== 'string' || body.entry.length === 0) {
      throw new HttpError(400, '`entry` must be a non-empty string.')
    }
    if (
      body.compileCommand !== undefined &&
      typeof body.compileCommand !== 'string' &&
      !Array.isArray(body.compileCommand)
    ) {
      throw new HttpError(400, '`compileCommand` must be a string or string[] when provided.')
    }
    if (Array.isArray(body.compileCommand)) {
      for (const tok of body.compileCommand) {
        if (typeof tok !== 'string') {
          throw new HttpError(400, '`compileCommand` array entries must all be strings.')
        }
      }
    }

    const projectRoot = path.resolve(options.projectRoot ?? PROJECT_ROOT_DEFAULT)
    const entry = normaliseRelative(body.entry)
    if (!entry.endsWith('.ts')) {
      throw new HttpError(400, `Entry must be a .ts file (got "${body.entry}").`)
    }
    const sourceAbs = path.join(projectRoot, entry)
    if (!isInsideRoot(projectRoot, sourceAbs)) {
      throw new HttpError(400, `Entry "${body.entry}" escapes the project root.`)
    }
    try {
      const stat = await fs.stat(sourceAbs)
      if (stat.size > MAX_SOURCE_BYTES) {
        throw new HttpError(
          413,
          `Source file exceeds ${MAX_SOURCE_BYTES} bytes (got ${stat.size}).`,
        )
      }
    } catch (err) {
      if (err instanceof HttpError) throw err
      // ENOENT etc — keep the message terse.
      throw new HttpError(404, `Entry file "${entry}" not found in project root ${projectRoot}.`)
    }

    let result: Awaited<ReturnType<typeof orchestrate>>
    try {
      result = await orchestrate({
        sourcePath: sourceAbs,
        projectRoot,
        entry,
        ...(body.compileCommand !== undefined
          ? { compileCommand: body.compileCommand as string | ReadonlyArray<string> }
          : {}),
      })
    } catch (err) {
      // Map typed runner errors (which carry their own HTTP status)
      // to HttpError so the Fastify error handler returns the right
      // code; let everything else propagate as a 500.
      if (err && typeof err === 'object' && 'status' in err) {
        const status = (err as { status?: unknown }).status
        if (typeof status === 'number') {
          throw new HttpError(status, err instanceof Error ? err.message : String(err))
        }
      }
      throw err
    }

    reply.header('content-type', 'application/x-ndjson')
    reply.header('cache-control', 'no-store')
    reply.header('x-instrument-stages', JSON.stringify(result.stages))

    // Stream the child's stdout NDJSON to the client. We wrap the
    // async iterable in a string stream because that's what
    // Fastify's reply.send expects for streaming bodies.
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const line of result.run.lines) {
            controller.enqueue(encoder.encode(`${line}\n`))
          }
          // After the child exits, surface non-zero exits so the
          // client can tell success from failure.
          const exitCode = await result.run.exitCode
          if (exitCode !== 0) {
            const stderr = await result.run.stderr
            const errLine = JSON.stringify({
              event: '__error',
              data: { exitCode, stderr: stderr.trim() },
            })
            controller.enqueue(encoder.encode(`${errLine}\n`))
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
      cancel() {
        // Client went away — best effort cleanup. The iterator's
        // finally{} already kills the child on abort.
        void result.run.exitCode
      },
    })

    return reply.send(stream)
  })
}

export default instrumentRoutes