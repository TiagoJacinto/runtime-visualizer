import { afterAll, beforeAll, expect } from 'vitest'
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber'
import * as path from 'node:path'
import { createApp } from '../../server/src/app.ts'
import type { FastifyInstance } from 'fastify'

const feature = await loadFeature(path.resolve(process.cwd(), 'features/observe-execution.feature'))
const projectRoot = path.resolve(process.cwd(), 'target/fixtures')

type Event = { event: string; data: Record<string, unknown> }

function eventsFrom(body: string): Event[] {
  return body.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line) as Event)
}

describeFeature(feature, ({ Scenario }) => {
  Scenario('Follow the FizzBuzz execution through a branch', ({ Given, When, Then, And }) => {
    let app: FastifyInstance
    let responseBody = ''

    beforeAll(async () => {
      app = await createApp({ cfgProjectRoot: projectRoot })
    })
    afterAll(async () => {
      await app.close()
    })

    Given('Procedure{name: "file1.ts", status: Ready}', () => {
      expect(app).toBeDefined()
    })

    When('I run(procedure: "file1.ts")', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/instrument/run',
        payload: { entry: 'file1.ts' },
      })
      expect(response.statusCode).toBe(200)
      responseBody = response.body
    })

    Then('I await view ExecutionEvent{kind: Statement, label: "const upper = 15"} in Trace: Initialization is observed', () => {
      expect(eventsFrom(responseBody)).toContainEqual(expect.objectContaining({
        event: 'statement',
        data: expect.objectContaining({ kind: 'Statement', label: 'const upper = 15' }),
      }))
    })

    And('I await view ExecutionEvent{kind: Branch, condition: "i % 15 === 0", outcome: True} in Trace: FizzBuzz branch is observed', () => {
      expect(eventsFrom(responseBody)).toContainEqual(expect.objectContaining({
        event: 'if',
        data: expect.objectContaining({ kind: 'Branch', condition: 'i % 15 === 0', outcome: 'True' }),
      }))
    })

    And('I await view Result{status: Succeeded} in Execution: Procedure completion is observed', () => {
      expect(eventsFrom(responseBody)).toContainEqual({ event: 'result', data: { status: 'Succeeded' } })
    })

    And('I view ExecutionEvent{state: Active} not in Trace: No event remains active after completion', () => {
      expect(eventsFrom(responseBody).some((event) => event.data.state === 'Active')).toBe(false)
    })
  })
})
