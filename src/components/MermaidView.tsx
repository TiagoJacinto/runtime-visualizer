/**
 * Renders a Mermaid flowchart source.
 */

import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

let mermaidInited = false

async function ensureMermaid(): Promise<void> {
  if (mermaidInited) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
  })
  mermaidInited = true
}

let counter = 0

export type MermaidViewProps = {
  readonly source: string
}

export function MermaidView({ source }: MermaidViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Render the mermaid source into the container on `source` change.
  // The graph id is unique per render so consecutive `render()`
  // calls don't collide on mermaid's internal cache.
  useEffect(() => {
    if (source.length === 0) return
    let cancelled = false
    const id = `mermaid-graph-${counter++}`
    void (async () => {
      try {
        await ensureMermaid()
        if (cancelled || containerRef.current === null) return
        const { svg } = await mermaid.render(id, source)
        if (cancelled || containerRef.current === null) return
        containerRef.current.innerHTML = svg
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  return (
    <div className="mermaid-view">
      {error !== null && <div className="mermaid-error">mermaid: {error}</div>}
      <div ref={containerRef} className="mermaid-container" />
    </div>
  )
}

