/**
 * Shared types between the visualizer and the server's Mermaid
 * WebSocket protocol. Mirror the shapes in
 * `server/src/routes/mermaid-ws.ts` so a breaking change on the
 * server trips a TypeScript error here.
 */

export type MermaidNodeRef = {
  readonly nodeId: string
  /** Mermaid node id; matches the SVG `<g>` id suffix. */
  readonly mermaidId: string
  readonly fn: string
  readonly fileIdx: number
  readonly file: string
  readonly label: string
  readonly kind: string
}

export type SnapshotMessage = {
  readonly type: 'snapshot'
  readonly entry: string
  readonly mermaid: string
  readonly files: ReadonlyArray<string>
  readonly nodes: ReadonlyArray<MermaidNodeRef>
}

export type ErrorMessage = {
  readonly type: 'error'
  readonly message: string
  readonly entry?: string
}

export type PongMessage = { readonly type: 'pong' }

export type ServerMessage = SnapshotMessage | ErrorMessage | PongMessage
