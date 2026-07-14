import type { FastifyPluginAsync } from 'fastify'

export type HealthRoutesOptions = {
  readonly now?: () => Date
}

const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, options) => {
  const now = options.now ?? (() => new Date())

  app.get('/', async () => ({
    status: 'ok',
    uptimeMs: Math.round(process.uptime() * 1000),
    timestamp: now().toISOString(),
  }))
}

export default healthRoutes
