import { describe, expect, it, beforeEach } from 'bun:test'
import type { FastifyInstance } from 'fastify'
import { createApp } from '../src/app.ts'
import { call } from './helpers.ts'

describe('GET /api/health', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await createApp({ now: () => new Date('2024-01-01T00:00:00.000Z') })
  })

  it('returns ok status with timestamp and uptime', async () => {
    const res = await call(app, 'GET', '/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      status: 'ok',
      uptimeMs: expect.any(Number),
      timestamp: '2024-01-01T00:00:00.000Z',
    })
  })
})

describe('GET /api/runtime', () => {
  it('exposes node version, platform, arch, pid', async () => {
    const app = await createApp()
    const res = await call(app, 'GET', '/api/runtime')
    expect(res.status).toBe(200)
    const body = res.body as {
      node: { version: string; platform: string; arch: string; pid: number }
      memory: { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number }
      timestamp: string
    }
    expect(body.node.version).toMatch(/^v\d+\.\d+\.\d+/)
    expect(typeof body.node.platform).toBe('string')
    expect(typeof body.node.arch).toBe('string')
    expect(typeof body.node.pid).toBe('number')
    expect(typeof body.memory.rssBytes).toBe('number')
    expect(typeof body.timestamp).toBe('string')
  })
})

describe('GET /api/runtime/memory', () => {
  it('returns memory usage numbers and an ISO timestamp', async () => {
    const app = await createApp()
    const res = await call(app, 'GET', '/api/runtime/memory')
    expect(res.status).toBe(200)
    const body = res.body as {
      rssBytes: number
      heapUsedBytes: number
      heapTotalBytes: number
      externalBytes: number
      timestamp: string
    }
    expect(typeof body.rssBytes).toBe('number')
    expect(typeof body.heapUsedBytes).toBe('number')
    expect(typeof body.heapTotalBytes).toBe('number')
    expect(typeof body.externalBytes).toBe('number')
    expect(typeof body.timestamp).toBe('string')
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow()
  })
})

describe('GET /api/runtime/uptime', () => {
  it('returns a non-negative uptime in ms', async () => {
    const app = await createApp()
    const res = await call(app, 'GET', '/api/runtime/uptime')
    expect(res.status).toBe(200)
    const body = res.body as { uptimeMs: number }
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0)
  })
})

describe('error handling', () => {
  it('returns 500 with the message for a non-HttpError', async () => {
    const app = await createApp({
      registerTestRoutes: (a) => {
        a.get('/__test/boom', () => {
          throw new Error('boom')
        })
      },
    })
    const res = await call(app, 'GET', '/__test/boom')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'boom' })
  })

  it('returns a generic message when the thrown value is not an Error', async () => {
    const app = await createApp({
      registerTestRoutes: (a) => {
        a.get('/__test/string-throw', () => {
          throw 'not an error'
        })
      },
    })
    const res = await call(app, 'GET', '/__test/string-throw')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })
})

describe('GET /api/echo', () => {
  it('returns ok', async () => {
    const app = await createApp()
    const res = await call(app, 'GET', '/api/echo')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})

describe('POST /api/echo', () => {
  it('echoes the message and metadata back', async () => {
    const app = await createApp()
    const res = await call(app, 'POST', '/api/echo', {
      message: 'hello',
      metadata: { traceId: 'abc' },
    })
    expect(res.status).toBe(200)
    const body = res.body as {
      ok: boolean
      received: { message: string; metadata: { traceId: string }; contentType: string | null }
    }
    expect(body.ok).toBe(true)
    expect(body.received.message).toBe('hello')
    expect(body.received.metadata).toEqual({ traceId: 'abc' })
    expect(body.received.contentType).toBe('application/json')
  })

  it('handles a missing body gracefully', async () => {
    const app = await createApp()
    const res = await call(app, 'POST', '/api/echo')
    expect(res.status).toBe(200)
    const body = res.body as { received: { message: null; metadata: null } }
    expect(body.received.message).toBeNull()
    expect(body.received.metadata).toBeNull()
  })
})

describe('unknown routes', () => {
  it('responds with 404 and an error payload', async () => {
    const app = await createApp()
    const res = await call(app, 'GET', '/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not Found' })
  })
})