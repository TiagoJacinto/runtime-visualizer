/**
 * Integration tests for `POST /api/instrument/run`.
 *
 * The route is the spec's "create this endpoint" surface: it
 * orchestrates source → instrument → compile → spawn, streams the
 * spawned target's NDJSON events back to the HTTP client, and
 * honours the content-hash cache optimisation.
 *
 * Tests use an ephemeral port (`call` from helpers.ts) and a
 * fixture under `target/fixtures/` that mirrors the user's
 * "simplified example of instrumentation". We drive the spawn
 * through `bun` so we don't depend on a global `node` binary.
 */
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { createApp } from '../src/app.ts'
import { call } from './helpers.ts'

const PROJECT_ROOT = path.resolve(
  import.meta.dir,
  '..',
  '..',
  'target',
  'fixtures',
)

async function rmCache(): Promise<void> {
  await fs.rm(path.join(PROJECT_ROOT, '.instrumented'), {
    recursive: true,
    force: true,
  })
}

describe('POST /api/instrument/run', () => {
  beforeEach(async () => {
    await rmCache()
  })

  afterEach(async () => {
    await rmCache()
  })

  it('returns 400 when entry is missing', async () => {
    const app = await createApp({ cfgProjectRoot: PROJECT_ROOT })
    const res = await call(app, 'POST', '/api/instrument/run', {})
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/entry/i)
  })

  it('returns 404 when entry is not a real file', async () => {
    const app = await createApp({ cfgProjectRoot: PROJECT_ROOT })
    const res = await call(app, 'POST', '/api/instrument/run', {
      entry: 'does-not-exist.ts',
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 when entry escapes the project root', async () => {
    const app = await createApp({ cfgProjectRoot: PROJECT_ROOT })
    const res = await call(app, 'POST', '/api/instrument/run', {
      entry: '../server/package.json',
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when compileCommand is the wrong shape', async () => {
    const app = await createApp({ cfgProjectRoot: PROJECT_ROOT })
    const res = await call(app, 'POST', '/api/instrument/run', {
      entry: 'file1.ts',
      compileCommand: 42,
    })
    expect(res.status).toBe(400)
  })

  it('returns a 200 NDJSON stream with `statement` and `if` events', async () => {
    const app = await createApp({ cfgProjectRoot: PROJECT_ROOT })
    const res = await call(app, 'POST', '/api/instrument/run', {
      entry: 'file1.ts',
    })
    expect(res.status).toBe(200)
    const body = res.body
    expect(typeof body).toBe('string')
    const lines = (body as string).split('\n').filter((l) => l.length > 0)
    expect(lines.length).toBeGreaterThan(0)
    // The fixture's `console.log` writes non-NDJSON text to stdout
    // alongside the instrumented events; filter to JSON lines only.
    const events = lines
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l) as { event: string; data: unknown })
    // We expect at least one `if` event and a `statement` event
    // from the FizzBuzz fixture.
    const kinds = new Set(events.map((e) => e.event))
    expect(kinds.has('if')).toBe(true)
    expect(kinds.has('statement')).toBe(true)
  })

  it('writes a cached instrumented JS after the first call', async () => {
    const app1 = await createApp({ cfgProjectRoot: PROJECT_ROOT })
    const cold = await call(app1, 'POST', '/api/instrument/run', { entry: 'file1.ts' })
    expect(cold.status).toBe(200)
    const cacheDir = path.join(PROJECT_ROOT, '.instrumented', 'file1.ts')
    const entries = await fs.readdir(cacheDir)
    expect(entries.some((e) => e.endsWith('.instrumented.js'))).toBe(true)
    expect(entries.some((e) => e.endsWith('.instrumented.ts'))).toBe(true)
  })

  it('honours a user-supplied compile command (argv form)', async () => {
    const app = await createApp({ cfgProjectRoot: PROJECT_ROOT })
    const res = await call(app, 'POST', '/api/instrument/run', {
      entry: 'file1.ts',
      compileCommand: ['bun', 'build', '{input}', '--target', 'node', '--outfile', '{output}'],
    })
    expect(res.status).toBe(200)
    const body = res.body as string
    expect(body.split('\n').filter((l) => l.length > 0).length).toBeGreaterThan(0)
  })
})