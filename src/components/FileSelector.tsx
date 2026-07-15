/**
 * Dropdown listing every file under the server's `filesFolder`.
 * Selecting a file navigates to the matching URL via React Router.
 *
 * The file list is fetched once on mount. Files come back as paths
 * relative to the configured folder (e.g. `fixtures/file1.ts`).
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export type FileSelectorProps = {
  /** Currently-selected file (must match a route). */
  readonly current: string
}

export function FileSelector({ current }: FileSelectorProps) {
  const [files, setFiles] = useState<ReadonlyArray<string>>([])
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/files')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as string[]
        if (cancelled) return
        setFiles(data.filter((f) => f.endsWith('.ts')))
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="file-selector">
      <label htmlFor="file-select">File:</label>
      <select
        id="file-select"
        value={current}
        onChange={(e) => navigate(`/${e.target.value}`)}
        disabled={files.length === 0}
      >
        {files.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      {error !== null && <span className="file-selector-error">{error}</span>}
    </div>
  )
}
