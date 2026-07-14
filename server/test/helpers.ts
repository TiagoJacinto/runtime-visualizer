/**
 * Shared test helpers for the server test suite.
 */
import type { FastifyInstance } from 'fastify'

export type TestResponse = {
  readonly status: number
  readonly body: unknown
}

/**
 * Spins up the given Fastify app on an ephemeral port, sends a request,
 * then tears the server down. Returns the status + parsed JSON body.
 */
export async function call(
  app: FastifyInstance,
  method: string,
  url: string,
  body?: unknown,
): Promise<TestResponse> {
  await app.listen({ port: 0, host: '127.0.0.1' })
  try {
    const address = app.server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('expected a port number from app.listen({ port: 0 })')
    }
    const port = address.port
    const init: RequestInit = {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }
    const response = await fetch(`http://127.0.0.1:${port}${url}`, init)
    const text = await response.text()
    let parsed: unknown = null
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }
    return { status: response.status, body: parsed }
  } finally {
    await app.close()
  }
}
