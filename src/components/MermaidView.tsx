/**
 * Renders a Mermaid `flowchart` source and applies a `.highlight`
 * CSS class to any node whose `mermaidId` appears in
 * `highlightedIds`.
 *
 * Mermaid tags every node group with an id like
 * `flowchart-<nodeId>-<seq>`. We resolve the seq-less form
 * (`flowchart-<nodeId>`) to a regex and toggle a class on each
 * matching `<g>` after each render. This avoids re-rendering the
 * whole diagram on every event tick.
 */

import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import type { MermaidNodeRef } from '../lib/types.ts'

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
  readonly nodes: ReadonlyArray<MermaidNodeRef>
  readonly highlightedIds: ReadonlySet<string>
}

export function MermaidView({ source, nodes, highlightedIds }: MermaidViewProps) {
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
        applyHighlights(containerRef.current, highlightedIds, nodes)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // Re-apply highlights without re-rendering on every event tick.
  useEffect(() => {
    if (containerRef.current === null) return
    applyHighlights(containerRef.current, highlightedIds, nodes)
  }, [highlightedIds, nodes])


  return (
    <div className="mermaid-view">
      {error !== null && <div className="mermaid-error">mermaid: {error}</div>}
      <div ref={containerRef} className="mermaid-container" />
    </div>
  )
}

function applyHighlights(
  container: HTMLElement,
  highlightedIds: ReadonlySet<string>,
  nodes: ReadonlyArray<MermaidNodeRef>,
): void {
  // Clear previous highlights.
  const previouslyHighlighted = container.querySelectorAll('g.node.highlighted')
  previouslyHighlighted.forEach((el) => el.classList.remove('highlighted'))
  if (highlightedIds.size === 0) return
  // Mermaid prefixes group ids with `flowchart-<sanitised>-<seq>`.
  // We rebuild the prefix set on each call so we don't miss a
  // newly-rendered node that wasn't in the previous selection.
  const prefixes: string[] = []
  for (const id of highlightedIds) {
    const mermaidId = nodes.find((node) => node.nodeId === id)?.mermaidId
    if (mermaidId !== undefined) prefixes.push(`flowchart-${mermaidId}-`)
  }
  if (prefixes.length === 0) return
  const pattern = new RegExp(`^(${prefixes.map(escapeRegex).join('|')})`)
  const allGroups = container.querySelectorAll('g.node')
  allGroups.forEach((el) => {
    const id = el.id
    if (typeof id === 'string' && pattern.test(id)) {
      el.classList.add('highlighted')
    }
  })
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
