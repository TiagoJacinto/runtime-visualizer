/**
 * Mermaid flowchart renderer for control-flow graphs.
 *
 * Given a {@link ControlFlowGraph} (or a list of {@link ProjectFile}s
 * from {@link buildProjectCfg}), emits the source of a Mermaid
 * `flowchart` diagram. The renderer is purely presentational — it
 * never re-walks the source — so callers can pair it with whatever
 * upstream produced the CFG (analyser, project walker, future
 * incremental rebuild).
 *
 * Node ids are namespaced per file (`f0`, `f1`, …) so a multi-file
 * subgraph doesn't collide on the underlying id space. Mermaid's
 * graphviz-style identifiers are sanitised through a single
 * {@link makeIdResolver} helper that memoises the mapping — the same
 * raw input always returns the same final id within a render.
 */

import type {
  CfgEdge,
  FunctionCfg,
} from './types.ts'
import type { ProjectFile } from './project.ts'

/** A single unit of input to the renderer: a {@link ProjectFile}-shaped pair. */
export type MermaidInput = Pick<ProjectFile, 'path' | 'cfg'>

/** Options for {@link renderMermaid}. */
export type RenderOptions = {
  /**
   * Graph direction (`TD`, `LR`, …). Mermaid default is `TD`; we
   * default to `TD` too so the output is always valid without
   * choosing.
   */
  readonly direction?: 'TD' | 'LR' | 'RL' | 'BT'
}

const DEFAULT_DIRECTION: 'TD' | 'LR' | 'RL' | 'BT' = 'TD'

/**
 * Renders a single file's CFG as a Mermaid `flowchart` source.
 */
export function renderMermaid(input: MermaidInput, options: RenderOptions = {}): string {
  return renderMermaidMany([input], options)
}

/**
 * Renders one or more file CFGs as a single Mermaid `flowchart`
 * source. Each file becomes a `subgraph`, so the resulting diagram
 * mirrors the import topology the project walker produces.
 */
export function renderMermaidMany(
  inputs: ReadonlyArray<MermaidInput>,
  options: RenderOptions = {},
): string {
  return renderMermaidManyWithNodes(inputs, options).mermaid
}

/**
 * Renders the Mermaid source and a parallel node list. The node
 * list maps each CFG node id to the resolved Mermaid identifier
 * used in the source so the visualizer can post-render highlight
 * a specific node in the SVG (Mermaid prefixes group ids with
 * `flowchart-<id>-N`, so the client just needs the `<id>` part).
 */
export function renderMermaidManyWithNodes(
  inputs: ReadonlyArray<MermaidInput>,
  options: RenderOptions = {},
): { mermaid: string; nodes: ReadonlyArray<MermaidNodeRef> } {
  const direction = options.direction ?? DEFAULT_DIRECTION
  const id = makeIdResolver()
  const lines: string[] = []
  const nodes: MermaidNodeRef[] = []
  lines.push(`flowchart ${direction}`)

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]
    if (input === undefined) continue
    const filePrefix = `f${i}`
    lines.push(`  subgraph ${id(`file_${i}_${input.path}`)}["${escapeLabel(input.path)}"]`)
    lines.push(`    direction ${direction}`)
    collectNodes(nodes, input.cfg.functions, filePrefix, i, input.path, id)
    emitFunctions(lines, input.cfg.functions, filePrefix, direction, id)
    lines.push(`  end`)
  }

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]
    if (input === undefined) continue
    const filePrefix = `f${i}`
    emitFunctionEdges(lines, input.cfg.functions, filePrefix, id)
  }

  return { mermaid: lines.join('\n') + '\n', nodes }
}

/**
 * Convenience wrapper: feed it the raw {@link ProjectFile}s and
 * options, get Mermaid back. Returns an empty flowchart for an empty
 * input list so the websocket can still send a valid message.
 */
export function renderProjectFiles(
  files: ReadonlyArray<ProjectFile>,
  options: RenderOptions = {},
): string {
  return renderMermaidMany(files, options)
}

/**
 * Like {@link renderProjectFiles} but also returns the per-node
 * metadata the visualizer uses to highlight currently-running
 * statements in the rendered SVG.
 */
export function renderProjectFilesWithNodes(
  files: ReadonlyArray<ProjectFile>,
  options: RenderOptions = {},
): { mermaid: string; nodes: ReadonlyArray<MermaidNodeRef> } {
  return renderMermaidManyWithNodes(files, options)
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

/** Per-node metadata emitted alongside the Mermaid source. */
export type MermaidNodeRef = {
  /** CFG node id (e.g. `"stmt_3"`); the same id the instrument sends. */
  readonly nodeId: string
  /** Mermaid node identifier after sanitisation; matches the SVG group id suffix. */
  readonly mermaidId: string
  /** Function the node belongs to. */
  readonly fn: string
  /** File index inside the project subgraph. */
  readonly fileIdx: number
  /** Source-relative path of the file containing this node. */
  readonly file: string
  /** Human-readable label rendered inside the node. */
  readonly label: string
  /** CFG node kind (`statement`, `branch`, `return`, …). */
  readonly kind: string
}

function collectNodes(
  out: MermaidNodeRef[],
  functions: ReadonlyArray<FunctionCfg>,
  filePrefix: string,
  fileIdx: number,
  file: string,
  id: (raw: string) => string,
): void {
  const fnPrefix = `${filePrefix}_fn`
  for (const fn of functions) {
    for (const node of fn.nodes) {
      out.push({
        nodeId: node.id,
        mermaidId: id(`${fnPrefix}_${node.id}`),
        fn: fn.name,
        fileIdx,
        file,
        label: node.label,
        kind: node.kind,
      })
    }
  }
}

function emitFunctions(
  lines: string[],
  functions: ReadonlyArray<FunctionCfg>,
  filePrefix: string,
  direction: 'TD' | 'LR' | 'RL' | 'BT',
  id: (raw: string) => string,
): void {
  for (const fn of functions) {
    const fnPrefix = `${filePrefix}_fn`
    lines.push(`    subgraph ${id(`${fnPrefix}_${fn.name}`)}["${escapeLabel(fnHeaderLabel(fn))}"]`)
    lines.push(`      direction ${direction}`)
    for (const node of fn.nodes) {
      lines.push(`      ${id(`${fnPrefix}_${node.id}`)}["${escapeLabel(node.label)}"]`)
    }
    lines.push(`    end`)
  }
}

function emitFunctionEdges(
  lines: string[],
  functions: ReadonlyArray<FunctionCfg>,
  filePrefix: string,
  id: (raw: string) => string,
): void {
  const fnPrefix = `${filePrefix}_fn`
  for (const fn of functions) {
    const labelByNode = new Map<string, string>()
    for (const node of fn.nodes) labelByNode.set(node.id, node.label)
    for (const edge of fn.edges) {
      const from = id(`${fnPrefix}_${edge.from}`)
      const to = id(`${fnPrefix}_${edge.to}`)
      const label = edgeLabelText(edge, labelByNode)
      if (label === null) {
        lines.push(`    ${from} --> ${to}`)
      } else {
        lines.push(`    ${from} -->|${escapePipeLabel(label)}| ${to}`)
      }
    }
  }
}

function edgeLabelText(edge: CfgEdge, labelByNode: ReadonlyMap<string, string>): string | null {
  // The existing CFG `label` field wins when present (callers can
  // attach arbitrary text). Otherwise we synthesise one from the
  // edge kind so the diagram stays informative.
  if (edge.label !== undefined && edge.label.length > 0) return edge.label
  switch (edge.kind) {
    case 'true':
      return 'true'
    case 'false':
      return 'false'
    case 'case': {
      const target = labelByNode.get(edge.to)
      return target !== undefined ? target.replace(/:$/, '') : 'case'
    }
    case 'default':
      return 'default'
    case 'unwind':
      return 'unwind'
    case 'entry':
    case 'next':
    case undefined:
      return null
  }
}

function fnHeaderLabel(fn: FunctionCfg): string {
  const asyncStar = `${fn.isAsync ? 'async ' : ''}${fn.isGenerator ? '*' : ''}`
  const params = fn.params.length > 0 ? `(${fn.params.join(', ')})` : '()'
  return `function ${asyncStar}${fn.name}${params}`
}

// ---------------------------------------------------------------------------
// Escaping helpers
// ---------------------------------------------------------------------------

/**
 * Turns a node label into something Mermaid can render inside a
 * `["..."]` double-quoted string. We collapse internal newlines into
 * spaces (the CFG labels are short single-line by convention) and
 * escape the two characters Mermaid treats as significant inside a
 * quoted label: `"` and `\`.
 */
function escapeLabel(label: string): string {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
}

function escapePipeLabel(label: string): string {
  // Edge labels live between `|...|` pipes, so they can't contain `|`.
  return label.replace(/\|/g, '\\|')
}

/**
 * Builds an id resolver that maps any raw input string to a valid
 * Mermaid graphviz-style identifier `[A-Za-z_][A-Za-z0-9_]*`,
 * memoising the result so the same input always yields the same id
 * within a single render pass.
 *
 * Without memoisation a node would get id `X` when declared and `X_1`
 * when referenced from an edge — the shared counter would bump on the
 * second call.
 */
function makeIdResolver(): (raw: string) => string {
  const cache = new Map<string, string>()
  const collisions = new Map<string, number>()
  return (raw: string): string => {
    const cached = cache.get(raw)
    if (cached !== undefined) return cached
    const safe = raw.replace(/[^A-Za-z0-9_]/g, '_')
    const seed = safe.length > 0 && /[A-Za-z_]/.test(safe[0]!) ? safe : `_${safe}`
    const n = collisions.get(seed)
    let id: string
    if (n === undefined) {
      collisions.set(seed, 1)
      id = seed
    } else {
      collisions.set(seed, n + 1)
      id = `${seed}_${n}`
    }
    cache.set(raw, id)
    return id
  }
}