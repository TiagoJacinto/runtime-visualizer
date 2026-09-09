/**
 * Custom HTTP error thrown by route handlers; the Fastify error
 * handler (set up in `app.ts`) maps these to a JSON response.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  // SAFETY: this is an internal serialized error-body boundary, not external input.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    // SAFETY: route code supplies the optional serialized error body.
    this.body = body ?? { error: message };
    this.name = "HttpError";
  }
}
