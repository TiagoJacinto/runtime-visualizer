/**
 * Public data shapes for the control-flow-graph (CFG) analyser.
 *
 * The analyser walks a TypeScript source file and produces one
 * {@link FunctionCfg} per top-level (or nested) function-like declaration.
 * Each function CFG is a directed graph of {@link CfgNode} basic blocks
 * connected by {@link CfgEdge}s.
 *
 * The shapes are deliberately JSON-serialisable so they can be sent over
 * HTTP and consumed by a visualiser on the front-end.
 */

/** A 1-based line/column span in the original source file. */
export type SourceLocation = {
  readonly start: { readonly line: number; readonly column: number }
  readonly end: { readonly line: number; readonly column: number }
}

/** The kind of a CFG basic block. */
export type CfgNodeKind =
  /** Synthetic entry point for a function. */
  | 'entry'
  /** Synthetic exit point for a function. */
  | 'exit'
  /** A straight-line statement (expression, var/let/const, expr-stmt, ...). */
  | 'statement'
  /** A branching condition (`if` test, ternary test, `while`/`for`/`do-while` test). */
  | 'branch'
  /** A join node that merges several control-flow edges. */
  | 'merge'
  /** A `switch` discriminant dispatch node. */
  | 'switch'
  /** A `case` clause under a `switch`. */
  | 'case'
  /** A `default` clause under a `switch`. */
  | 'default'
  /** A `return` (or implicit fall-through to the function exit). */
  | 'return'
  /** A `throw` statement (control transfers to a `catch` block or the exit). */
  | 'throw'
  /** A `break` statement (control transfers to the enclosing loop/switch exit). */
  | 'break'
  /** A `continue` statement (control transfers to the enclosing loop head). */
  | 'continue'
  /** A `try` block entry, with an outgoing edge to the `catch`/`finally`. */
  | 'try'
  /** A `catch` block entry. */
  | 'catch'
  /** A `finally` block entry. */
  | 'finally'

/** A single basic block in the CFG. */
export type CfgNode = {
  /** Stable, unique id within the enclosing {@link FunctionCfg}. */
  readonly id: string
  readonly kind: CfgNodeKind
  /** Human-readable short label, e.g. `if (x > 0)`, `return x`, `for (...)`. */
  readonly label: string
  /** Original source span for this node, if available. */
  readonly location?: SourceLocation
  /** Original source text for the statement, if available. */
  readonly text?: string
}

/** The kind of a CFG edge. */
export type CfgEdgeKind =
  /** Fall-through / sequential edge inside a block. */
  | 'next'
  /** Edge taken when the branch condition evaluates to true. */
  | 'true'
  /** Edge taken when the branch condition evaluates to false. */
  | 'false'
  /** Edge from a switch dispatch to a specific `case` clause. */
  | 'case'
  /** Edge from a switch dispatch to the `default` clause. */
  | 'default'
  /** Edge from a `try` block to the corresponding `catch`/`finally`. */
  | 'unwind'
  /** Edge into the function entry node. */
  | 'entry'

/** A directed edge between two {@link CfgNode}s. */
export type CfgEdge = {
  readonly from: string
  readonly to: string
  readonly kind?: CfgEdgeKind
  /** Free-form label (e.g. the case value text `"x === 1"`). */
  readonly label?: string
}

/** A CFG for a single function-like declaration. */
export type FunctionCfg = {
  /** Function name as written in source (e.g. `"foo"`); `"<anonymous>"` for unnamed function expressions. */
  readonly name: string
  /** Names of declared parameters (excluding `this` and rest binding). */
  readonly params: ReadonlyArray<string>
  readonly isAsync: boolean
  readonly isGenerator: boolean
  readonly isExported: boolean
  readonly nodes: ReadonlyArray<CfgNode>
  readonly edges: ReadonlyArray<CfgEdge>
  /** Id of the synthetic {@link CfgNodeKind.entry} node. */
  readonly entry: string
  /** Id of the synthetic {@link CfgNodeKind.exit} node. */
  readonly exit: string
  readonly location?: SourceLocation
}

/** The CFG produced for an entire TypeScript file. */
export type ControlFlowGraph = {
  /** Optional virtual file name attached to the source. */
  readonly filePath?: string
  /** One entry per function-like declaration encountered in the file. */
  readonly functions: ReadonlyArray<FunctionCfg>
}