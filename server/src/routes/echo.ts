import type { FastifyPluginAsync } from 'fastify'

const echoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({ ok: true }))

  app.post('/', async (req) => {
    const body = (typeof req.body === 'object' && req.body !== null
      ? req.body
      : {}) as { message?: unknown; metadata?: Record<string, unknown> }
    return {
      ok: true,
      received: {
        message: body.message ?? null,
        metadata: body.metadata ?? null,
        contentType: req.headers['content-type'] ?? null,
      },
    }
  })
}

export default echoRoutes