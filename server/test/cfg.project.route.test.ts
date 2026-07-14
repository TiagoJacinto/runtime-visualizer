import { describe, expect, it, beforeEach } from 'bun:test'
import type { FastifyInstance } from 'fastify'
import * as path from 'node:path'
import { createApp } from '../src/app.ts'
import { call } from './helpers.ts'
import type { ProjectCfg } from '../src/cfg/project.ts'

const FIXTURES = path.resolve(import.meta.dir, '..', '..', 'target', 'fixtures')
const REAL_TARGET = path.resolve(import.meta.dir, '..', '..', 'target')

describe('POST /api/cfg/project', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await createApp({ cfgProjectRoot: FIXTURES })
  })

  it('returns the import-subgraph CFG for a relative entry', async () => {
    const res = await call(app, 'POST', '/api/cfg/project', { entry: 'entry.ts' })
    expect(res.status).toBe(200)
    const body = res.body as { ok: boolean; project: ProjectCfg }
    expect(body.ok).toBe(true)
    expect(body.project.entry).toBe('entry.ts')
    const paths = body.project.files.map((f) => f.path).sort()
    expect(paths).toEqual(['entry.ts', 'leaf.ts', 'mid.ts'])
    expect(body.project.graph['entry.ts']).toEqual(['mid.ts'])
  })

  it('rejects a missing entry field', async () => {
    const res = await call(app, 'POST', '/api/cfg/project', {})
    expect(res.status).toBe(400)
  })

  it('rejects a non-string entry', async () => {
    const res = await call(app, 'POST', '/api/cfg/project', { entry: 42 })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the entry file does not exist on disk', async () => {
    const res = await call(app, 'POST', '/api/cfg/project', { entry: 'no-such.ts' })
    expect(res.status).toBe(404)
  })

  it('rejects paths that try to escape the project root', async () => {
    const res = await call(app, 'POST', '/api/cfg/project', { entry: '../package.json' })
    expect(res.status).toBe(400)
  })

  it('rejects non-.ts entries', async () => {
    const res = await call(app, 'POST', '/api/cfg/project', { entry: 'leaf.js' })
    expect(res.status).toBe(400)
  })

  it('marks external and missing imports without aborting the build', async () => {
    const res = await call(app, 'POST', '/api/cfg/project', { entry: 'entry.ts' })
    expect(res.status).toBe(200)
    const body = res.body as { project: ProjectCfg }
    const entry = body.project.files.find((f) => f.path === 'entry.ts')!
    const statuses = entry.imports.map((i) => i.status).sort()
    expect(statuses).toContain('external')
    expect(statuses).toContain('missing')
    expect(statuses).toContain('ok')
  })

  it('works against the real ./target directory when injected as project root', async () => {
    const fs = await import('node:fs')
    if (!fs.existsSync(path.join(REAL_TARGET, 'arithmetic.ts'))) return
    const realApp = await createApp({ cfgProjectRoot: REAL_TARGET })
    const res = await call(realApp, 'POST', '/api/cfg/project', { entry: 'arithmetic.ts' })
    expect(res.status).toBe(200)
    const body = res.body as { project: ProjectCfg }
    expect(body.project.entry).toBe('arithmetic.ts')
    expect(body.project.files.map((f) => f.path).sort()).toEqual([
      'arithmetic.ts',
      'constants.ts',
    ])
  })
})
