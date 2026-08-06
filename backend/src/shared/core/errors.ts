/**
 * Custom HTTP error thrown by route handlers; the Fastify error
 * handler (set up in `app.ts`) maps these to a JSON response.
 */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HttpError'
  }
}
