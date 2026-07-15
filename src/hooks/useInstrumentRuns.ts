/**
 * Drives the instrument endpoint:
 *
 *   POST /api/instrument/run  →  NDJSON stream of `__visualizer_send`
 *   events, each carrying a CFG node id in `data.id`.
 *
 * The hook maintains a list of runs. Each run tracks the id of the
 * most-recent event from its NDJSON stream so the visualiser can
 * highlight the corresponding Mermaid node while the program is
 * running. Multiple runs may be live concurrently — clicking Run
 * while another run is in flight starts a fresh run.
 *
 * ponytail: no per-run abort control. The fetch is cancelled
 * implicitly when the consumer stops awaiting; the route kills
 * the child process on stream close.
 */

import { useCallback, useRef, useState } from 'react'
import type { InstrumentErrorEvent, InstrumentEvent } from '../lib/types.ts'

export type RunStatus = 'running' | 'ok' | 'failed'

export type RunState = {
  /** Sequential id for the run; used as React key. */
  readonly id: number
  /** Current CFG node id from the latest event, or `null` before any event arrived. */
  readonly currentNodeId: string | null
  /** Most recent event's label (human-readable), used as a tooltip / status line. */
  readonly currentLabel: string | null
  readonly status: RunStatus
  /** Non-zero exit code on failure; `null` otherwise. */
  readonly exitCode: number | null
  /** Stderr captured on non-zero exit; empty on success / while running. */
  readonly stderr: string | null
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
    setRuns((prev) => [
      ...prev,
      { id: runId, currentNodeId: null, currentLabel: null, status: 'running', exitCode: null, stderr: null },
    ])
    void streamRun(entry, runId, (patch) => {
      setRuns((prev) =>
        prev.map((r) => (r.id === runId ? { ...r, ...patch } : r)),
      )
    })
  }, [])

  const clearFinished = useCallback(() => {
    setRuns((prev) => prev.filter((r) => r.status === 'running'))
  }, [])

  return { runs, startRun, clearFinished }
}

async function streamRun(
  entry: string,
  _runId: number,
  patchRun: (patch: Partial<RunState>) => void,
): Promise<void> {
  try {
    const response = await fetch('/api/instrument/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entry }),
    })
    if (!response.ok || response.body === null) {
      const text = await response.text().catch(() => '')
      patchRun({
        status: 'failed',
        exitCode: response.status,
        stderr: text.length > 0 ? text : `HTTP ${response.status}`,
      })
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    // Each NDJSON line is one event. We split on `\n` and tolerate a
    // partial trailing chunk in `pending`.
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
    // Stream ended cleanly with no `__error` sentinel → success.
    patchRun({ status: 'ok' })
  } catch (err) {
    patchRun({
      status: 'failed',
      exitCode: -1,
      stderr: err instanceof Error ? err.message : String(err),
    })
  }
}

function handleLine(line: string, patchRun: (patch: Partial<RunState>) => void): void {
  const trimmed = line.trim()
  if (trimmed.length === 0) return
  // The spawned program may write non-JSON text (e.g. `console.log`
  // in the FizzBuzz fixture). Skip anything that doesn't parse as
  // `{` — the stream-level `__error` sentinel also starts with `{`.
  if (!trimmed.startsWith('{')) return
  let parsed: InstrumentEvent | InstrumentErrorEvent
  try {
    parsed = JSON.parse(trimmed) as InstrumentEvent | InstrumentErrorEvent
  } catch {
    return
  }
  if (parsed.event === '__error') {
    const errEvt = parsed as InstrumentErrorEvent
    patchRun({
      status: 'failed',
      exitCode: errEvt.data.exitCode,
      stderr: errEvt.data.stderr,
    })
    return
  }
  const data = (parsed as InstrumentEvent).data
  const nodeId = typeof data.id === 'string' ? data.id : null
  const label = typeof data.label === 'string' ? data.label : null
  patchRun({ currentNodeId: nodeId, currentLabel: label })
}
