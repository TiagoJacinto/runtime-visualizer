import type { FastifyPluginAsync } from 'fastify'

export type RuntimeRoutesOptions = {
  readonly now?: () => Date
}

type RuntimePayload = {
  readonly node: {
    readonly version: string
    readonly platform: NodeJS.Platform
    readonly arch: string
    readonly pid: number
  }
  readonly bun: {
    readonly version: string | null
  }
  readonly memory: {
    readonly rssBytes: number
    readonly heapUsedBytes: number
    readonly heapTotalBytes: number
  }
  readonly timestamp: string
}

const runtimeRoutes: FastifyPluginAsync<RuntimeRoutesOptions> = async (app, options) => {
  const now = options.now ?? (() => new Date())

  app.get('/', async (): Promise<RuntimePayload> => {
    const memoryUsage = process.memoryUsage()
    const bunVersion =
      typeof globalThis.Bun !== 'undefined' && typeof globalThis.Bun.version === 'string'
        ? globalThis.Bun.version
        : null

    return {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
      },
      bun: {
        version: bunVersion,
      },
      memory: {
        rssBytes: memoryUsage.rss,
        heapUsedBytes: memoryUsage.heapUsed,
        heapTotalBytes: memoryUsage.heapTotal,
      },
      timestamp: now().toISOString(),
    }
  })

  app.get('/memory', async () => {
    const memoryUsage = process.memoryUsage()
    return {
      rssBytes: memoryUsage.rss,
      heapUsedBytes: memoryUsage.heapUsed,
      heapTotalBytes: memoryUsage.heapTotal,
      externalBytes: memoryUsage.external,
      timestamp: now().toISOString(),
    }
  })

  app.get('/uptime', async () => ({
    uptimeMs: Math.round(process.uptime() * 1000),
    timestamp: now().toISOString(),
  }))
}

export default runtimeRoutes
