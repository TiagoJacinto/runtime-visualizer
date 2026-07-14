import type { FastifyPluginAsync } from 'fastify'
import { analyseTypeScript } from '../cfg/analyzer.ts'
import { buildProjectCfg, ProjectCfgError } from '../cfg/project.ts'
import { HttpError } from '../middleware.ts'

type CfgRequestBody = {
  readonly source?: unknown
  readonly filePath?: unknown
}

type CfgProjectBody = {
  readonly entry?: unknown
  readonly root?: unknown
}

const MAX_SOURCE_BYTES = 60_000

export type CfgRoutesOptions = {
  /** Project root for the `/api/cfg/project` endpoint. */
  readonly projectRoot?: string
}

const cfgRoutes: FastifyPluginAsync<CfgRoutesOptions> = async (app, options) => {
  app.get('/', async () => ({
    ok: true,
    info:
      'POST { source: string, filePath?: string } to build a control-flow graph, or POST /api/cfg/project { entry: string } to build the import-subgraph.',
  }))

  app.post('/', async (req) => {
    const body = (typeof req.body === 'object' && req.body !== null
      ? req.body
      : {}) as CfgRequestBody

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

    return { ok: true, cfg }
  })

  app.post('/project', async (req) => {
    const body = (typeof req.body === 'object' && req.body !== null
      ? req.body
      : {}) as CfgProjectBody

    if (typeof body.entry !== 'string' || body.entry.length === 0) {
      throw new HttpError(400, '`entry` must be a non-empty path relative to the project root.')
    }
    if (body.root !== undefined && typeof body.root !== 'string') {
      throw new HttpError(400, '`root` must be a string when provided.')
    }

    const project = await buildProjectCfg(body.entry, {
      ...(options.projectRoot !== undefined ? { root: options.projectRoot } : {}),
      ...(typeof body.root === 'string' ? { root: body.root } : {}),
    }).catch((err: unknown): never => {
      if (err instanceof ProjectCfgError) {
        throw new HttpError(err.status, err.message)
      }
      throw err
    })

    return { ok: true, project }
  })
}

export default cfgRoutes