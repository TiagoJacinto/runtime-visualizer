import { Router, type Request, type Response } from 'express'

type EchoBody = {
  readonly message?: unknown
  readonly metadata?: Record<string, unknown>
}

export function createEchoRouter(): Router {
  const router = Router()

  router.get('/', (_req: Request, res: Response) => {
    res.json({ ok: true })
  })

  router.post('/', (req: Request, res: Response) => {
    const body: EchoBody =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as EchoBody)
        : {}

    res.json({
      ok: true,
      received: {
        message: body.message ?? null,
        metadata: body.metadata ?? null,
        contentType: req.get('content-type') ?? null,
      },
    })
  })

  return router
}
