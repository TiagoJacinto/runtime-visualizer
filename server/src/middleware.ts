import type { Request, Response, NextFunction } from 'express'

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HttpError'
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not Found' })
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  const message = err instanceof Error ? err.message : 'Internal Server Error'
  console.error('[server] unhandled error:', err)
  res.status(500).json({ error: message })
}
