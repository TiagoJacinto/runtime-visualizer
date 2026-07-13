import { Router, type Request, type Response } from 'express'

export type RuntimeRouterOptions = {
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

export function createRuntimeRouter(options: RuntimeRouterOptions = {}): Router {
  const router = Router()
  const now = options.now ?? (() => new Date())

  router.get('/', (_req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage()
    const bunVersion =
      typeof globalThis.Bun !== 'undefined' && typeof globalThis.Bun.version === 'string'
        ? globalThis.Bun.version
        : null

    const payload: RuntimePayload = {
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

    res.json(payload)
  })

  router.get('/memory', (_req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage()
    res.json({
      rssBytes: memoryUsage.rss,
      heapUsedBytes: memoryUsage.heapUsed,
      heapTotalBytes: memoryUsage.heapTotal,
      externalBytes: memoryUsage.external,
      timestamp: now().toISOString(),
    })
  })

  router.get('/uptime', (_req: Request, res: Response) => {
    res.json({
      uptimeMs: Math.round(process.uptime() * 1000),
      timestamp: now().toISOString(),
    })
  })

  return router
}
