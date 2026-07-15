/**
 * Subscribes to the Mermaid WebSocket endpoint for a single file
 * entry. Returns the latest snapshot (mermaid source + node map)
 * or `null` while waiting for the first push.
 *
 * ponytail: one-shot ref reconnect on `entry` change. Reusing the
 * same WebSocket for multiple entries would need server-side
 * `subscribe`/`unsubscribe` frames; the client mirrors that
 * protocol by toggling an `unsubscribe` frame on entry change.
 */

import { useEffect, useRef, useState } from 'react'
import type { ServerMessage, SnapshotMessage } from '../lib/types.ts'

export type MermaidSnapshotState = {
  readonly snapshot: SnapshotMessage | null
  readonly error: string | null
  readonly connected: boolean
}

export function useMermaidSnapshot(entry: string): MermaidSnapshotState {
  const [snapshot, setSnapshot] = useState<SnapshotMessage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // Reset state on entry change; otherwise a new snapshot for a
    // different file would briefly display alongside the old one.
    setSnapshot(null)
    setError(null)
    setConnected(false)

    const ws = new WebSocket(wsUrl('/api/mermaid'))
    wsRef.current = ws

    ws.addEventListener('open', () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'subscribe', entry }))
    })

    ws.addEventListener('message', (event) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(event.data as string) as ServerMessage
      } catch {
        // Drop malformed frames — the server already validates input.
        return
      }
      if (msg.type === 'snapshot') {
        setSnapshot(msg)
        setError(null)
      } else if (msg.type === 'error') {
        setError(msg.message)
      }
      // `pong` is informational only.
    })

    ws.addEventListener('close', () => setConnected(false))
    ws.addEventListener('error', () => {
      setError('WebSocket connection failed.')
      setConnected(false)
    })

    return () => {
      // Best-effort unsubscribe on unmount or entry change. The
      // server closes the socket on socket close, but sending the
      // frame keeps cleanup deterministic.
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe' }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [entry])

  return { snapshot, error, connected }
}

function wsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}${path}`
}