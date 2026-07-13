/**
 * Shared test helpers for the server test suite.
 */
import type { Application } from 'express'

export type TestResponse = {
  readonly status: number
  readonly body: unknown
}

/**
 * Spins up the given Express app on an ephemeral port, sends a request,
 * then tears the server down. Returns the status + parsed JSON body.
 */
export async function call(
  app: Application,
  method: string,
  url: string,
  body?: unknown,
): Promise<TestResponse> {
  const server = app.listen(0)
  try {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('expected a port number from app.listen(0)')
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
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}