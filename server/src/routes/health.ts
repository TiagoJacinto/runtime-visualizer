import { Router, type Request, type Response } from 'express'

export type HealthRouterOptions = {
  readonly now?: () => Date
}

export function createHealthRouter(options: HealthRouterOptions = {}): Router {
  const router = Router()
  const now = options.now ?? (() => new Date())

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptimeMs: Math.round(process.uptime() * 1000),
      timestamp: now().toISOString(),
    })
  })

  return router
}
