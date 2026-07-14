import { describe, expect, it, beforeEach } from 'bun:test'
import type { FastifyInstance } from 'fastify'
import { createApp } from '../src/app.ts'
import type { ControlFlowGraph } from '../src/cfg/types.ts'
import { call } from './helpers.ts'

describe('GET /api/cfg', () => {
  it('returns usage info', async () => {
    const app = await createApp()
    const res = await call(app, 'GET', '/api/cfg')
    expect(res.status).toBe(200)
    const body = res.body as { ok: boolean; info: string }
    expect(body.ok).toBe(true)
    expect(typeof body.info).toBe('string')
    expect(body.info).toContain('source')
  })
})

describe('POST /api/cfg', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await createApp()
  })

  it('builds a CFG for a simple function', async () => {
    const res = await call(app, 'POST', '/api/cfg', {
      source: `function add(a: number, b: number): number {
  if (a < 0) return -1
  return a + b
}`,
    })
    expect(res.status).toBe(200)
    const body = res.body as { ok: boolean; cfg: ControlFlowGraph }
    expect(body.ok).toBe(true)
    expect(body.cfg.functions).toHaveLength(1)
    const fn = body.cfg.functions[0]!
    expect(fn.name).toBe('add')
    expect(fn.params).toEqual(['a', 'b'])
    const kinds = fn.nodes.map((n) => n.kind)
    expect(kinds).toContain('entry')
    expect(kinds).toContain('exit')
    expect(kinds).toContain('branch')
  })

  it('rejects a missing source string', async () => {
    const res = await call(app, 'POST', '/api/cfg', {})
    expect(res.status).toBe(400)
    const body = res.body as { error: string }
    expect(body.error).toMatch(/source/i)
  })

  it('rejects a non-string source', async () => {
    const res = await call(app, 'POST', '/api/cfg', { source: 42 })
    expect(res.status).toBe(400)
  })

  it('rejects an empty source string', async () => {
    const res = await call(app, 'POST', '/api/cfg', { source: '' })
    expect(res.status).toBe(400)
  })

  it('rejects an oversized source string', async () => {
    const res = await call(app, 'POST', '/api/cfg', { source: 'a'.repeat(60_001) })
    expect(res.status).toBe(413)
  })

  it('rejects a non-string filePath', async () => {
    const res = await call(app, 'POST', '/api/cfg', { source: 'function f(){}', filePath: 12 })
    expect(res.status).toBe(400)
  })

  it('attaches the provided filePath to the result', async () => {
    const res = await call(app, 'POST', '/api/cfg', {
      source: 'function f(){}',
      filePath: 'demo.ts',
    })
    expect(res.status).toBe(200)
    const body = res.body as { cfg: ControlFlowGraph }
    expect(body.cfg.filePath).toBe('demo.ts')
  })

  it('returns an empty functions list for source with no functions', async () => {
    const res = await call(app, 'POST', '/api/cfg', { source: 'const x = 1' })
    expect(res.status).toBe(200)
    const body = res.body as { cfg: ControlFlowGraph }
    expect(body.cfg.functions).toEqual([])
  })

  it('handles a missing body gracefully', async () => {
    const res = await call(app, 'POST', '/api/cfg')
    expect(res.status).toBe(400)
  })
})