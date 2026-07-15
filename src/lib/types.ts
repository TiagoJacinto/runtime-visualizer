/**
 * Shared types between the visualizer and the server's Mermaid
 * WebSocket protocol. Mirror the shapes in
 * `server/src/routes/mermaid-ws.ts` so a breaking change on the
 * server trips a TypeScript error here.
 */

export type CfgNodeKind =
  | 'entry' | 'exit' | 'statement' | 'branch' | 'merge'
  | 'switch' | 'case' | 'default' | 'return' | 'throw'
  | 'break' | 'continue' | 'try' | 'catch' | 'finally'

export type MermaidNodeRef = {
  /** CFG node id; same id the instrument endpoint emits. */
  readonly nodeId: string
  /** Mermaid node id; matches the SVG `<g>` id suffix. */
  readonly mermaidId: string
  readonly fn: string
  readonly fileIdx: number
  readonly file: string
  readonly label: string
  readonly kind: CfgNodeKind
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

/**
 * One event from the NDJSON stream produced by the instrument
 * endpoint. `data.id` is the CFG node id used for highlighting.
 */
export type InstrumentEvent = {
  readonly event: string
  readonly data: {
    readonly id?: string
    readonly cond?: string
    readonly fn?: string
    readonly label?: string
    readonly [k: string]: unknown
  }
  readonly ts?: number
}

/** Stream-end marker for non-zero exits. */
export type InstrumentErrorEvent = {
  readonly event: '__error'
  readonly data: { readonly exitCode: number; readonly stderr: string }
}
