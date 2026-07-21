import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createApp } from '../src/app.ts'
import { call } from './helpers.ts'

const PROJECT_ROOT = path.resolve(import.meta.dir, '..', '..', 'target', 'fixtures')

async function clearCache(): Promise<void> {
  await fs.rm(path.join(PROJECT_ROOT, '.instrumented'), { recursive: true, force: true })
}

describe('Observe procedure execution', () => {
  beforeEach(clearCache)
  afterEach(clearCache)

  it('follows the FizzBuzz execution through a branch', async () => {
    const app = await createApp({ cfgProjectRoot: PROJECT_ROOT })
    const response = await call(app, 'POST', '/api/instrument/run', { entry: 'file1.ts' })

    expect(response.status).toBe(200)
    const events = (response.body as string)
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as { event: string; data: Record<string, unknown> })

    expect(events).toContainEqual(expect.objectContaining({
      event: 'statement',
      data: expect.objectContaining({
        kind: 'Statement',
        label: 'const upper = 15',
      }),
    }))
    expect(events).toContainEqual(expect.objectContaining({
      event: 'if',
      data: expect.objectContaining({
        kind: 'Branch',
        condition: 'i % 15 === 0',
        outcome: 'True',
      }),
    }))
    expect(events).toContainEqual({ event: 'result', data: { status: 'Succeeded' } })
    expect(events.some((event) => event.data.state === 'Active')).toBe(false)
  })
})
