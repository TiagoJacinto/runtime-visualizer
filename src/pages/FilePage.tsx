/**
 * The single-page-per-file UI. Reads the current path from the
 * URL, subscribes to the Mermaid WebSocket for that file, lets
 * the current procedure's control-flow graph.
 */

import { useLocation, useNavigate } from 'react-router-dom'
import { FileSelector } from '../components/FileSelector.tsx'
import { MermaidView } from '../components/MermaidView.tsx'
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
  return (
    <div className="file-page">
      <header className="file-page-header">
        <h1>Runtime Visualizer</h1>
        <FileSelector current={file} />
        <span className={`connection-pill ${connected ? 'on' : 'off'}`}>
          {connected ? 'live' : 'offline'}
        </span>
      </header>

      {wsError !== null && (
        <div className="error-banner">Flowchart error: {wsError}</div>
      )}

      <section className="flowchart-section">
        {snapshot === null ? (
          <p className="muted">Loading flowchart…</p>
        ) : (
          <MermaidView
            source={snapshot.mermaid}
          />
        )}
      </section>
    </div>
  )
}

