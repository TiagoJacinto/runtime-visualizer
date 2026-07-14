import Fastify, { type FastifyInstance } from 'fastify'
import { HttpError } from './middleware.ts'
import healthRoutes from './routes/health.ts'
import runtimeRoutes from './routes/runtime.ts'
import echoRoutes from './routes/echo.ts'
import cfgRoutes from './routes/cfg.ts'

export type AppOptions = {
  readonly now?: () => Date
  /** Hook used by tests to register extra routes. */
  readonly registerTestRoutes?: (app: FastifyInstance) => void
  /** Project root used by `POST /api/cfg/project` (defaults to `<cwd>/target`). */
  readonly cfgProjectRoot?: string
}

/**
 * Builds a Fastify instance with the same routes/handlers the old
 * app exposed. Async because Fastify is async-first.
 *
 * The 404 + error handlers MUST be registered before the route
 * plugins so Fastify's encapsulation picks them up for every plugin
 * context. Registering them after would leave the plugins using the
 * built-in `{ statusCode, error, message }` default.
 */
export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    // Disable Fastify's own logger; we log via the onResponse hook
    // below to keep the output identical to the old version.
    logger: false,
    // Match the old 64 KiB JSON-body cap.
    bodyLimit: 64 * 1024,
  })

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: 'Not Found' })
  })

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) {
      reply.code(err.status).send({ error: err.message })
      return
    }
    // Fastify wraps any thrown non-Error value with a generic
    // "Non-Error thrown" message; hide the wrapper and return a
    // generic message instead, matching the old behaviour.
    const wrapped = err instanceof Error && err.message.startsWith('Non-Error thrown')
    const message = wrapped
      ? 'Internal Server Error'
      : err instanceof Error
        ? err.message
        : 'Internal Server Error'
    console.error('[server] unhandled error:', err)
    reply.code(500).send({ error: message })
  })

  app.addHook('onResponse', async (req, reply) => {
    console.log(`[server] ${req.method} ${req.url} (${Math.round(reply.elapsedTime)}ms)`)
  })

  await app.register(healthRoutes, { prefix: '/api/health', ...(options.now ? { now: options.now } : {}) })
  await app.register(runtimeRoutes, { prefix: '/api/runtime', ...(options.now ? { now: options.now } : {}) })
  await app.register(echoRoutes, { prefix: '/api/echo' })
  await app.register(cfgRoutes, {
    prefix: '/api/cfg',
    ...(options.cfgProjectRoot !== undefined ? { projectRoot: options.cfgProjectRoot } : {}),
  })

  if (options.registerTestRoutes) {
    options.registerTestRoutes(app)
  }

  return app
}