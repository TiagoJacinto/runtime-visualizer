/**
 * Custom HTTP error thrown by route handlers; the Fastify error
 * handler (set up in `app.ts`) maps these to a JSON response.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(
    status: number,
    message: string,
    body: unknown = { error: message },
  ) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "HttpError";
  }
}
