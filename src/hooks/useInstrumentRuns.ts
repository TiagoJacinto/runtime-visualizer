import { useCallback, useRef, useState } from 'react'
import type {
  ExecutionEvent,
  InstrumentErrorEvent,
  InstrumentEvent,
  ResultEvent,
} from '../lib/types.ts'

export type RunState = {
  readonly id: number
  readonly currentNodeId: string | null
  readonly currentLabel: string | null
  readonly running: boolean
  readonly exitCode: number | null
  readonly stderr: string | null
  readonly trace: ReadonlyArray<ExecutionEvent>
  readonly resultStatus: 'Succeeded' | 'Failed' | null
}

type RunPatch = Partial<Omit<RunState, 'trace'>> & {
  readonly event?: ExecutionEvent
}

export type UseInstrumentRunsResult = {
  readonly runs: ReadonlyArray<RunState>
  readonly startRun: (entry: string) => void
  readonly clearFinished: () => void
}

export function useInstrumentRuns(): UseInstrumentRunsResult {
  const [runs, setRuns] = useState<ReadonlyArray<RunState>>([])
  const nextIdRef = useRef(1)

  const startRun = useCallback((entry: string) => {
    const runId = nextIdRef.current++
    const controller = new AbortController()
    setRuns((prev) => [
      ...prev,
      {
        id: runId,
        currentNodeId: null,
        currentLabel: null,
        running: true,
        exitCode: null,
        stderr: null,
        trace: [],
        resultStatus: null,
      },
    ])

    void streamRun(entry, controller, (patch) => {
      setRuns((prev) => prev.map((run) => {
        if (run.id !== runId) return run
        const { event, ...fields } = patch
        const next = { ...run, ...fields }
        return event === undefined ? next : { ...next, trace: [...run.trace, event] }
      }))
    })
  }, [])

  const clearFinished = useCallback(() => {
    setRuns((prev) => prev.filter((run) => run.running))
  }, [])

  return { runs, startRun, clearFinished }
}

async function streamRun(
  entry: string,
  controller: AbortController,
  patchRun: (patch: RunPatch) => void,
): Promise<void> {
  try {
    const response = await fetch('/api/instrument/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entry }),
      signal: controller.signal,
    })
    if (!response.ok || response.body === null) {
      const text = await response.text().catch(() => '')
      patchRun({
        running: false,
        exitCode: response.status,
        resultStatus: 'Failed',
        stderr: text.length > 0 ? text : `HTTP ${response.status}`,
      })
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      let idx = pending.indexOf('\n')
      while (idx !== -1) {
        const line = pending.slice(0, idx)
        pending = pending.slice(idx + 1)
        handleLine(line, patchRun)
        idx = pending.indexOf('\n')
      }
    }
    if (pending.length > 0) handleLine(pending, patchRun)
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      patchRun({ running: false, exitCode: null, resultStatus: 'Failed', stderr: 'aborted' })
      return
    }
    patchRun({
      running: false,
      exitCode: -1,
      resultStatus: 'Failed',
      stderr: err instanceof Error ? err.message : String(err),
    })
  } finally {
    patchRun({ running: false })
  }
}

function handleLine(line: string, patchRun: (patch: RunPatch) => void): void {
  const trimmed = line.trim()
  if (trimmed.length === 0 || !trimmed.startsWith('{')) return

  let parsed: InstrumentEvent | InstrumentErrorEvent | ResultEvent
  try {
    parsed = JSON.parse(trimmed) as InstrumentEvent | InstrumentErrorEvent | ResultEvent
  } catch {
    return
  }
  if (parsed.event === 'result') {
    patchRun({ resultStatus: (parsed as ResultEvent).data.status })
    return
  }
  if (parsed.event === '__error') {
    const errorEvent = parsed as InstrumentErrorEvent
    patchRun({
      running: false,
      resultStatus: 'Failed',
      exitCode: errorEvent.data.exitCode,
      stderr: errorEvent.data.stderr,
    })
    return
  }
  if (parsed.event !== 'statement' && parsed.event !== 'if') return

  const event = toExecutionEvent(parsed as InstrumentEvent)
  patchRun({
    event,
    currentNodeId: event.id ?? null,
    currentLabel: event.label ?? event.condition ?? null,
  })
}

function toExecutionEvent(parsed: InstrumentEvent): ExecutionEvent {
  const data = parsed.data
  const kind = data.kind ?? (parsed.event === 'if' ? 'Branch' : 'Statement')
  return {
    kind,
    ...(typeof data.label === 'string' ? { label: data.label } : {}),
    ...(typeof data.condition === 'string' || typeof data.cond === 'string'
      ? { condition: data.condition ?? data.cond }
      : {}),
    ...(typeof data.outcome === 'string' ? { outcome: data.outcome } : {}),
    state: data.state ?? 'Completed',
    ...(typeof data.id === 'string' ? { id: data.id } : {}),
  }
}
