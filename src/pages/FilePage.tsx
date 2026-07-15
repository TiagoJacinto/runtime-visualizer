/**
 * The single-page-per-file UI. Reads the current path from the
 * URL, subscribes to the Mermaid WebSocket for that file, lets
 * the user run the file repeatedly (each click starts a new
 * concurrent run), and highlights every Mermaid node whose CFG
 * node id matches any currently-running run.
 */

import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FileSelector } from '../components/FileSelector.tsx'
import { MermaidView } from '../components/MermaidView.tsx'
import { useInstrumentRuns, type RunState } from '../hooks/useInstrumentRuns.ts'
import { useMermaidSnapshot } from '../hooks/useMermaidSnapshot.ts'

export function FilePage() {
  // The route is `/*`; everything after the leading slash is the
  // file path. React Router v7 strips the leading `/`, so we add
  // it back to match what the server's /api/files returns.
  const location = useLocation()
  const navigate = useNavigate()
  const file = location.pathname.replace(/^\//, '')

  // Redirect to a default file if the URL has no path (the App's
  // `/` route already navigates to `/functions.ts`, but a user
  // typing `/` directly could otherwise land on an empty page).
  if (file.length === 0) {
    navigate('/functions.ts', { replace: true })
  }

  const { snapshot, error: wsError, connected } = useMermaidSnapshot(file)
  const { runs, startRun, clearFinished } = useInstrumentRuns()

  // The set of currently-highlighted node ids = the union of every
  // running run's `currentNodeId`. Finished runs aren't included —
  // their "current" node is stale the instant the process exits.
  const highlightedIds = useMemo(() => {
    const set = new Set<string>()
    for (const r of runs) {
      if (r.running && r.currentNodeId !== null) set.add(r.currentNodeId)
    }
    return set
  }, [runs])

  return (
    <div className="file-page">
      <header className="file-page-header">
        <h1>Runtime Visualizer</h1>
        <FileSelector current={file} />
        <button
          type="button"
          className="run-button"
          onClick={() => startRun(file)}
          disabled={file.length === 0}
        >
          Run
        </button>
        {runs.some((r) => !r.running) && (
          <button
            type="button"
            className="clear-button"
            onClick={clearFinished}
          >
            Clear finished
          </button>
        )}
        <span className={`connection-pill ${connected ? 'on' : 'off'}`}>
          {connected ? 'live' : 'offline'}
        </span>
      </header>

      {wsError !== null && (
        <div className="error-banner">Flowchart error: {wsError}</div>
      )}

      <section className="runs-section">
        <h2>Runs ({runs.length})</h2>
        {runs.length === 0 ? (
          <p className="muted">No runs yet. Click Run to start one.</p>
        ) : (
          <ul className="runs-list">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </section>

      <section className="flowchart-section">
        {snapshot === null ? (
          <p className="muted">Loading flowchart…</p>
        ) : (
          <MermaidView
            source={snapshot.mermaid}
            nodes={snapshot.nodes}
            highlightedIds={highlightedIds}
          />
        )}
      </section>
    </div>
  )
}

function RunRow({ run }: { run: RunState }) {
  const status = run.running
    ? `running — node ${run.currentNodeId ?? '(none yet)'}`
    : run.exitCode === null
      ? 'done'
      : run.exitCode === 0
        ? 'done'
        : `exit ${run.exitCode}`
  return (
    <li className={`run-row ${run.running ? 'active' : 'finished'}`}>
      <span className="run-status">#{run.id} {status}</span>
      {run.currentLabel !== null && (
        <span className="run-label"> — {run.currentLabel}</span>
      )}
      {run.stderr !== null && run.stderr.length > 0 && (
        <pre className="run-stderr">{run.stderr}</pre>
      )}
    </li>
  )
}