/**
 * Renders a Mermaid `flowchart` source and applies a `.highlight`
 * CSS class to any node whose `mermaidId` appears in
 * `highlightedIds`.
 *
 * The client receives a list of `{ nodeId, mermaidId }` pairs
 * alongside the rendered source; the CFG node ids from the
 * instrument stream are translated to Mermaid ids via that list
 * before matching, because Mermaid tags groups with namespaced
 * ids (`flowchart-<mermaidId>-<seq>`) and the namespacing isn't
 * reconstructible from the CFG id alone.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
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
  /** CFG node ids that should be highlighted (from instrument stream). */
  readonly highlightedIds: ReadonlySet<string>
}

export function MermaidView({ source, nodes, highlightedIds }: MermaidViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Translate CFG node ids → Mermaid ids once per snapshot.
  const cfgToMermaid = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of nodes) m.set(n.nodeId, n.mermaidId)
    return m
  }, [nodes])
  const mermaidHighlightIds = useMemo(() => {
    const set = new Set<string>()
    for (const id of highlightedIds) {
      const mermaidId = cfgToMermaid.get(id)
      if (mermaidId !== undefined) set.add(mermaidId)
    }
    return set
  }, [highlightedIds, cfgToMermaid])

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
        applyHighlights(containerRef.current, mermaidHighlightIds)
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
    applyHighlights(containerRef.current, mermaidHighlightIds)
  }, [mermaidHighlightIds])

  return (
    <div className="mermaid-view">
      {error !== null && <div className="mermaid-error">mermaid: {error}</div>}
      <div ref={containerRef} className="mermaid-container" />
    </div>
  )
}

function applyHighlights(container: HTMLElement, mermaidIds: ReadonlySet<string>): void {
  // Clear previous highlights.
  const previouslyHighlighted = container.querySelectorAll('g.node.highlighted')
  previouslyHighlighted.forEach((el) => el.classList.remove('highlighted'))
  if (mermaidIds.size === 0) return
  // Mermaid prefixes group ids with `flowchart-<sanitised>-<seq>`,
  // so the prefix itself is enough to match.
  const pattern = new RegExp(
    `^(${Array.from(mermaidIds, escapeRegexForPrefix).join('|')})`,
  )
  const allGroups = container.querySelectorAll('g.node')
  allGroups.forEach((el) => {
    const id = el.id
    if (typeof id === 'string' && pattern.test(id)) {
      el.classList.add('highlighted')
    }
  })
}

function escapeRegexForPrefix(id: string): string {
  return `flowchart-${id}-`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}