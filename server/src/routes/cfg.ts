import { Router, type Request, type Response } from 'express'
import { analyseTypeScript } from '../cfg/analyzer.ts'
import { HttpError } from '../middleware.ts'

type CfgRequestBody = {
  readonly source?: unknown
  readonly filePath?: unknown
}

const MAX_SOURCE_BYTES = 1_000_000

export function createCfgRouter(): Router {
  const router = Router()

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      info: 'POST { source: string, filePath?: string } to build a control-flow graph.',
    })
  })

  router.post('/', (req: Request, res: Response) => {
    const body: CfgRequestBody =
      typeof req.body === 'object' && req.body !== null ? (req.body as CfgRequestBody) : {}

    if (typeof body.source !== 'string') {
      throw new HttpError(400, '`source` must be a string containing TypeScript source code.')
    }
    if (body.source.length === 0) {
      throw new HttpError(400, '`source` must not be empty.')
    }
    if (body.source.length > MAX_SOURCE_BYTES) {
      throw new HttpError(
        413,
        `\`source\` exceeds the maximum size of ${MAX_SOURCE_BYTES} bytes.`,
      )
    }
    if (body.filePath !== undefined && typeof body.filePath !== 'string') {
      throw new HttpError(400, '`filePath` must be a string when provided.')
    }

    const cfg = analyseTypeScript(body.source, {
      ...(typeof body.filePath === 'string' ? { filePath: body.filePath } : {}),
    })

    res.json({ ok: true, cfg })
  })

  return router
}