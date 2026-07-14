import express, { type Application, type Request, type Response, type NextFunction } from 'express'
import { createHealthRouter } from './routes/health.ts'
import { createRuntimeRouter } from './routes/runtime.ts'
import { createEchoRouter } from './routes/echo.ts'
import { createCfgRouter } from './routes/cfg.ts'
import { errorHandler, notFoundHandler } from './middleware.ts'

export type AppOptions = {
  readonly now?: () => Date
  readonly registerTestRoutes?: (app: Application) => void
  /** Project root used by `POST /api/cfg/project` (defaults to `<cwd>/target`). */
  readonly cfgProjectRoot?: string
}

export function createApp(options: AppOptions = {}): Application {
  const app = express()
  const now = options.now ?? (() => new Date())

  app.disable('x-powered-by')
  app.use(express.json({ limit: '64kb' }))

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = now()
    res.on('finish', () => {
      const elapsedMs = now().getTime() - startedAt.getTime()
      console.log(`[server] ${req.method} ${req.originalUrl} (${elapsedMs}ms)`)
    })
    next()
  })

  app.use('/api/health', createHealthRouter({ now }))
  app.use('/api/runtime', createRuntimeRouter({ now }))
  app.use('/api/echo', createEchoRouter())
  app.use(
    '/api/cfg',
    createCfgRouter(
      options.cfgProjectRoot !== undefined ? { projectRoot: options.cfgProjectRoot } : {},
    ),
  )

  if (options.registerTestRoutes) {
    options.registerTestRoutes(app)
  }

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
