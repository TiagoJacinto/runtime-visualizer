/**
 * Control-flow-graph analyser.
 *
 * Takes a TypeScript source string (and optional virtual file path) and
 * returns a {@link ControlFlowGraph}: one {@link FunctionCfg} per
 * function-like declaration discovered in the file.
 *
 * The implementation uses the TypeScript compiler API purely as a
 * parser — we walk the AST with the visitor helpers in `ts` and build a
 * hand-rolled CFG. There is no type checking and no semantic analysis.
 */

import * as ts from 'typescript'
import type {
  CfgEdge,
  CfgEdgeKind,
  CfgNode,
  CfgNodeKind,
  ControlFlowGraph,
  FunctionCfg,
  SourceLocation,
} from './types.ts'

/** Options for {@link analyseTypeScript}. */
export type AnalyseOptions = {
  /** Virtual file name attached to the source (helps with diagnostics). */
  readonly filePath?: string
  /** TypeScript language target used when parsing. Defaults to ESNext. */
  readonly target?: ts.ScriptTarget
}

/** Public entry point. Parses the source and returns a CFG. */
export function analyseTypeScript(
  source: string,
  options: AnalyseOptions = {},
): ControlFlowGraph {
  const filePath = options.filePath ?? 'inline.ts'
  const target = options.target ?? ts.ScriptTarget.ESNext
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    target,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )

  const functions: FunctionCfg[] = []
  visitNode(sourceFile)

  return { filePath, functions }

  function visitNode(node: ts.Node): void {
    if (isFunctionLike(node)) {
      functions.push(buildFunctionCfg(sourceFile, node))
      // We still want to look INSIDE the function body for nested
      // function-like declarations (closures, methods on objects, etc.).
    }
    ts.forEachChild(node, visitNode)
  }
}

// ---------------------------------------------------------------------------
// CFG building
// ---------------------------------------------------------------------------

/** Mutable accumulator used while building a single FunctionCfg. */
class CfgBuilder {
  readonly nodes: CfgNode[] = []
  readonly edges: CfgEdge[] = []
  private counter = 0

  /** Generates a fresh, unique node id within this function. */
  nextId(prefix: string): string {
    this.counter += 1
    return `${prefix}_${this.counter}`
  }

  addNode(node: CfgNode): CfgNode {
    this.nodes.push(node)
    return node
  }

  addEdge(from: string, to: string, kind?: CfgEdgeKind, label?: string): CfgEdge {
    const edge: CfgEdge = {
      from,
      to,
      ...(kind !== undefined ? { kind } : {}),
      ...(label !== undefined ? { label } : {}),
    }
    this.edges.push(edge)
    return edge
  }
}

/**
 * Determines whether a {@link ts.Node} corresponds to a function-like
 * declaration we should emit a CFG for.
 */
function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  )
}

function buildFunctionCfg(
  sourceFile: ts.SourceFile,
  fn: ts.FunctionLikeDeclaration,
): FunctionCfg {
  const builder = new CfgBuilder()
  const name = resolveFunctionName(fn) ?? '<anonymous>'
  const params = fn.parameters.map(paramName)
  const entry = builder.addNode({
    id: builder.nextId('entry'),
    kind: 'entry',
    label: `enter ${name}`,
    location: getLocation(sourceFile, fn),
  })
  const exit = builder.addNode({
    id: builder.nextId('exit'),
    kind: 'exit',
    label: `exit ${name}`,
  })

  const ctx: StatementContext = {
    functionExit: exit.id,
    loops: [],
  }

  // Connect the entry node into the body's first block. Arrow functions
  // can have an expression body rather than a block body — in that case
  // we emit the expression as a single statement inside an implicit
  // return-like basic block that flows into the function exit.
  const body = fn.body
  if (body !== undefined) {
    if (ts.isBlock(body)) {
      const seq = buildStatementList(sourceFile, builder, body.statements, [], ctx)
      if (seq.entry !== undefined) {
        builder.addEdge(entry.id, seq.entry, 'entry')
      } else {
        // Empty body: entry → exit.
        builder.addEdge(entry.id, exit.id, 'entry')
      }
      if (seq.exit !== undefined) {
        builder.addEdge(seq.exit, exit.id, 'next')
      }
    } else {
      // Concise expression body: model as a single implicit-return node.
      const exprNode = builder.addNode({
        id: builder.nextId('stmt'),
        kind: 'statement',
        label: snippet(sourceFile, body),
        location: getLocation(sourceFile, body),
        text: body.getText(sourceFile).trim(),
      })
      builder.addEdge(entry.id, exprNode.id, 'entry')
      builder.addEdge(exprNode.id, exit.id, 'next')
    }
  } else {
    // External / abstract / interface signature with no body.
    builder.addEdge(entry.id, exit.id, 'entry')
  }

  return {
    name,
    params,
    isAsync: hasModifier(fn, ts.SyntaxKind.AsyncKeyword),
    isGenerator: Boolean(fn.asteriskToken),
    isExported: hasModifier(fn, ts.SyntaxKind.ExportKeyword) || hasModifier(fn, ts.SyntaxKind.DefaultKeyword),
    nodes: builder.nodes,
    edges: builder.edges,
    entry: entry.id,
    exit: exit.id,
    location: getLocation(sourceFile, fn),
  }
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = (node as ts.Node & { modifiers?: ReadonlyArray<ts.ModifierLike> }).modifiers
  if (modifiers === undefined) return false
  return modifiers.some((m) => m.kind === kind)
}

/**
 * Best-effort name resolution for a function-like node.
 *
 * For function declarations the name is right there. For expressions
 * and arrows we look at the parent for a name hint (variable
 * declaration, property assignment, method shorthand, etc.).
 */
function resolveFunctionName(fn: ts.FunctionLikeDeclaration): string | undefined {
  if (
    (ts.isFunctionDeclaration(fn) ||
      ts.isFunctionExpression(fn) ||
      ts.isConstructorDeclaration(fn)) &&
    fn.name !== undefined
  ) {
    // These forms name the function with an Identifier, so .text is safe.
    return (fn.name as ts.Identifier).text
  }
  if (
    ts.isMethodDeclaration(fn) ||
    ts.isGetAccessorDeclaration(fn) ||
    ts.isSetAccessorDeclaration(fn)
  ) {
    return propertyNameText(fn.name)
  }
  // FunctionExpression or ArrowFunction: look at the parent for a name hint.
  const parent = fn.parent
  if (parent !== undefined) {
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text
    }
    if (
      ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent)
    ) {
      return propertyNameText(parent.name)
    }
    if (ts.isBindingElement(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text
    }
    if (ts.isBinaryExpression(parent) && ts.isIdentifier(parent.left)) {
      return parent.left.text
    }
    if (ts.isExportAssignment(parent)) {
      return '<export default>'
    }
  }
  return undefined
}

function propertyNameText(
  name: ts.PropertyName | ts.BindingName | undefined,
): string | undefined {
  if (name === undefined) return undefined
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text
  if (ts.isStringLiteralLike(name)) return name.text
  if (ts.isNumericLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name)) return '<computed>'
  return undefined
}

function paramName(p: ts.ParameterDeclaration | ts.VariableDeclaration): string {
  if (ts.isIdentifier(p.name)) return p.name.text
  if (ts.isArrayBindingPattern(p.name) || ts.isObjectBindingPattern(p.name))
    return '<destructured>'
  return '<param>'
}

// ---------------------------------------------------------------------------
// Statement-list builder
// ---------------------------------------------------------------------------

type LoopContext = {
  readonly label: string | undefined
  readonly head: string
  readonly exit: string
}

type StatementContext = {
  readonly functionExit: string
  readonly loops: ReadonlyArray<LoopContext>
}

/**
 * Builds the CFG for a sequence of statements and returns the
 * synthetic `entry` and `exit` nodes of the resulting subgraph.
 *
 * If the sequence is empty, `entry` is undefined and the caller should
 * treat the enclosing block as a passthrough (or hook up directly to
 * the function exit).
 */
function buildStatementList(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  statements: ReadonlyArray<ts.Statement>,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string | undefined; exit: string | undefined } {
  if (statements.length === 0) {
    return { entry: undefined, exit: undefined }
  }

  let prevExit: string | undefined = undefined
  let firstEntry: string | undefined = undefined

  for (const statement of statements) {
    const seq = buildStatement(sourceFile, builder, statement, loops, ctx)
    if (firstEntry === undefined && seq.entry !== undefined) {
      firstEntry = seq.entry
    }
    if (prevExit !== undefined && seq.entry !== undefined) {
      builder.addEdge(prevExit, seq.entry, 'next')
    }
    if (seq.exit === undefined) {
      // Sequence terminated: subsequent statements are unreachable.
      prevExit = undefined
      break
    }
    prevExit = seq.exit
  }

  return { entry: firstEntry, exit: prevExit }
}

/**
 * Builds the CFG for a single statement.
 *
 * Returns either:
 *   - a passthrough sequence (`entry` → … → `exit`), or
 *   - a terminator sequence (`entry` → …) that does not fall through
 *     (the caller should treat any subsequent statements as
 *     unreachable).
 */
function buildStatement(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  statement: ts.Statement,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  // ----- Terminators ------------------------------------------------------
  if (ts.isReturnStatement(statement)) {
    return buildReturn(sourceFile, builder, statement, ctx)
  }
  if (ts.isThrowStatement(statement)) {
    return buildThrow(sourceFile, builder, statement)
  }
  if (ts.isBreakOrContinueStatement(statement)) {
    return buildBreakContinue(sourceFile, builder, statement, loops)
  }

  // ----- Compound statements ---------------------------------------------
  if (ts.isBlock(statement)) {
    return buildBlock(sourceFile, builder, statement, loops, ctx)
  }
  if (ts.isIfStatement(statement)) {
    return buildIf(sourceFile, builder, statement, loops, ctx)
  }
  if (ts.isWhileStatement(statement)) {
    return buildWhile(sourceFile, builder, statement, loops, ctx)
  }
  if (ts.isDoStatement(statement)) {
    return buildDoWhile(sourceFile, builder, statement, loops, ctx)
  }
  if (ts.isForStatement(statement)) {
    return buildFor(sourceFile, builder, statement, loops, ctx)
  }
  if (ts.isForInStatement(statement) || ts.isForOfStatement(statement)) {
    return buildForInOf(sourceFile, builder, statement, loops, ctx)
  }
  if (ts.isSwitchStatement(statement)) {
    return buildSwitch(sourceFile, builder, statement, loops, ctx)
  }
  if (ts.isTryStatement(statement)) {
    return buildTry(sourceFile, builder, statement, loops, ctx)
  }
  if (ts.isLabeledStatement(statement)) {
    return buildLabeled(sourceFile, builder, statement, loops, ctx)
  }

  // ----- Plain straight-line statement -----------------------------------
  const node = builder.addNode({
    id: builder.nextId('stmt'),
    kind: 'statement',
    label: statementKindLabel(statement),
    location: getLocation(sourceFile, statement),
    text: statement.getText(sourceFile).trim(),
  })
  return { entry: node.id, exit: node.id }
}

function buildBlock(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  block: ts.Block,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  // We splice the block's contents into the enclosing sequence rather
  // than emitting a synthetic block node: a `{ ... }` block is purely
  // lexical scoping in JS, not a control-flow construct.
  const seq = buildStatementList(sourceFile, builder, block.statements, loops, ctx)
  if (seq.entry === undefined) {
    // Empty block: synthesize a no-op statement so the caller still has
    // a valid entry/exit pair to link against.
    const empty = builder.addNode({
      id: builder.nextId('stmt'),
      kind: 'statement',
      label: '{}',
      location: getLocation(sourceFile, block),
    })
    return { entry: empty.id, exit: empty.id }
  }
  return { entry: seq.entry, exit: seq.exit }
}

// ---------------------------------------------------------------------------
// Control-flow constructs
// ---------------------------------------------------------------------------

function buildReturn(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.ReturnStatement,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  const node = builder.addNode({
    id: builder.nextId('ret'),
    kind: 'return',
    label: stmt.expression !== undefined ? `return ${snippet(sourceFile, stmt.expression)}` : 'return',
    location: getLocation(sourceFile, stmt),
    text: stmt.getText(sourceFile).trim(),
  })
  builder.addEdge(node.id, ctx.functionExit, 'next')
  return { entry: node.id, exit: undefined }
}

function buildThrow(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.ThrowStatement,
): { entry: string; exit: string | undefined } {
  const node = builder.addNode({
    id: builder.nextId('thr'),
    kind: 'throw',
    label: `throw ${snippet(sourceFile, stmt.expression)}`,
    location: getLocation(sourceFile, stmt),
    text: stmt.getText(sourceFile).trim(),
  })
  // We don't statically know which catch (if any) will handle this;
  // emitting no outgoing edge leaves the throw as a CFG sink.
  return { entry: node.id, exit: undefined }
}

function buildBreakContinue(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.BreakOrContinueStatement,
  loops: ReadonlyArray<LoopContext>,
): { entry: string; exit: string | undefined } {
  const isContinue = stmt.kind === ts.SyntaxKind.ContinueStatement
  const labelText = stmt.label?.text
  const target = isContinue ? resolveContinue(loops, labelText) : resolveBreak(loops, labelText)
  if (target === undefined) {
    // `break`/`continue` outside of any loop — still emit a node so the
    // shape of the surrounding code is visible, but with no outgoing edge.
    const node = builder.addNode({
      id: builder.nextId(isContinue ? 'cont' : 'brk'),
      kind: isContinue ? 'continue' : 'break',
      label: `${isContinue ? 'continue' : 'break'}${labelText !== undefined ? ` ${labelText}` : ''} (no target)`,
      location: getLocation(sourceFile, stmt),
      text: stmt.getText(sourceFile).trim(),
    })
    return { entry: node.id, exit: undefined }
  }
  const node = builder.addNode({
    id: builder.nextId(isContinue ? 'cont' : 'brk'),
    kind: isContinue ? 'continue' : 'break',
    label: `${isContinue ? 'continue' : 'break'}${labelText !== undefined ? ` ${labelText}` : ''}`,
    location: getLocation(sourceFile, stmt),
    text: stmt.getText(sourceFile).trim(),
  })
  builder.addEdge(node.id, target, 'next')
  return { entry: node.id, exit: undefined }
}

function resolveBreak(
  loops: ReadonlyArray<LoopContext>,
  label: string | undefined,
): string | undefined {
  if (label !== undefined) {
    const found = [...loops].reverse().find((l) => l.label === label)
    return found?.exit
  }
  const last = loops[loops.length - 1]
  return last?.exit
}

function resolveContinue(
  loops: ReadonlyArray<LoopContext>,
  label: string | undefined,
): string | undefined {
  if (label !== undefined) {
    const found = [...loops].reverse().find((l) => l.label === label)
    return found?.head
  }
  const last = loops[loops.length - 1]
  return last?.head
}

function buildIf(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.IfStatement,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  const branch = builder.addNode({
    id: builder.nextId('branch'),
    kind: 'branch',
    label: `if (${snippet(sourceFile, stmt.expression)})`,
    location: getLocation(sourceFile, stmt.expression),
    text: stmt.expression.getText(sourceFile),
  })

  const thenSeq = buildStatement(sourceFile, builder, stmt.thenStatement, loops, ctx)
  builder.addEdge(branch.id, thenSeq.entry, 'true')

  const merge = builder.addNode({
    id: builder.nextId('merge'),
    kind: 'merge',
    label: '(merge)',
  })

  if (stmt.elseStatement !== undefined) {
    const elseSeq = buildStatement(sourceFile, builder, stmt.elseStatement, loops, ctx)
    builder.addEdge(branch.id, elseSeq.entry, 'false')
    if (elseSeq.exit !== undefined) {
      builder.addEdge(elseSeq.exit, merge.id, 'next')
    }
  } else {
    builder.addEdge(branch.id, merge.id, 'false')
  }

  // Then-block may terminate (return/throw/break/continue); only connect
  // its exit to the merge if it actually falls through.
  if (thenSeq.exit !== undefined) {
    builder.addEdge(thenSeq.exit, merge.id, 'next')
  }

  return { entry: branch.id, exit: merge.id }
}

function buildWhile(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.WhileStatement,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  const head = builder.addNode({
    id: builder.nextId('branch'),
    kind: 'branch',
    label: `while (${snippet(sourceFile, stmt.expression)})`,
    location: getLocation(sourceFile, stmt.expression),
    text: stmt.expression.getText(sourceFile),
  })
  const exit = builder.addNode({
    id: builder.nextId('loop-exit'),
    kind: 'merge',
    label: '(loop exit)',
  })
  const body = buildStatement(sourceFile, builder, stmt.statement, loops, ctx)
  builder.addEdge(head.id, body.entry, 'true')
  builder.addEdge(head.id, exit.id, 'false')
  if (body.exit !== undefined) {
    builder.addEdge(body.exit, head.id, 'next')
  }
  return {
    entry: head.id,
    exit: exit.id,
  }
}

function buildDoWhile(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.DoStatement,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  const body = buildStatement(sourceFile, builder, stmt.statement, loops, ctx)
  const head = builder.addNode({
    id: builder.nextId('branch'),
    kind: 'branch',
    label: `do-while (${snippet(sourceFile, stmt.expression)})`,
    location: getLocation(sourceFile, stmt.expression),
    text: stmt.expression.getText(sourceFile),
  })
  const exit = builder.addNode({
    id: builder.nextId('loop-exit'),
    kind: 'merge',
    label: '(loop exit)',
  })
  builder.addEdge(body.entry, head.id, 'next')
  builder.addEdge(head.id, body.entry, 'true')
  builder.addEdge(head.id, exit.id, 'false')
  // do-while body executes at least once: enter via body, not via head.
  return { entry: body.entry, exit: exit.id }
}

function buildFor(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.ForStatement,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  const head = builder.addNode({
    id: builder.nextId('branch'),
    kind: 'branch',
    label:
      stmt.condition !== undefined ? `for (${snippet(sourceFile, stmt.condition)})` : 'for (;;)',
    location: stmt.condition !== undefined ? getLocation(sourceFile, stmt.condition) : undefined,
    text: stmt.condition?.getText(sourceFile),
  })
  const exit = builder.addNode({
    id: builder.nextId('loop-exit'),
    kind: 'merge',
    label: '(loop exit)',
  })
  const body = buildStatement(sourceFile, builder, stmt.statement, loops, ctx)
  builder.addEdge(head.id, body.entry, 'true')
  builder.addEdge(head.id, exit.id, 'false')

  // Build the init/update tail.
  const tail: { entry: string; exit: string }[] = []
  if (stmt.initializer !== undefined) {
    tail.push(buildForInit(sourceFile, builder, stmt.initializer))
  }
  if (stmt.incrementor !== undefined) {
    tail.push(buildForInit(sourceFile, builder, stmt.incrementor))
  }

  if (tail.length > 0) {
    // Wire tail entries together.
    for (let i = 1; i < tail.length; i++) {
      const prev = tail[i - 1]
      const cur = tail[i]
      if (prev !== undefined && cur !== undefined) {
        builder.addEdge(prev.exit, cur.entry, 'next')
      }
    }
    const first = tail[0]
    const last = tail[tail.length - 1]
    if (first !== undefined && last !== undefined) {
      builder.addEdge(last.exit, head.id, 'next')
      if (body.exit !== undefined) {
        builder.addEdge(body.exit, first.entry, 'next')
      }
      return { entry: first.entry, exit: exit.id }
    }
  }

  // No init/update: just hook body exit back to the head.
  if (body.exit !== undefined) {
    builder.addEdge(body.exit, head.id, 'next')
  }
  return { entry: head.id, exit: exit.id }
}

function buildForInit(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  init: ts.ForInitializer,
): { entry: string; exit: string } {
  if (ts.isVariableDeclarationList(init)) {
    let prev: string | undefined = undefined
    let first: string | undefined = undefined
    for (const decl of init.declarations) {
      const node = builder.addNode({
        id: builder.nextId('stmt'),
        kind: 'statement',
        label: snippet(sourceFile, decl),
        text: decl.getText(sourceFile).trim(),
      })
      if (first === undefined) first = node.id
      if (prev !== undefined) builder.addEdge(prev, node.id, 'next')
      prev = node.id
    }
    const firstId = first ?? builder.addNode({
      id: builder.nextId('stmt'),
      kind: 'statement',
      label: '<empty>',
    }).id
    return { entry: firstId, exit: prev ?? firstId }
  }
  const node = builder.addNode({
    id: builder.nextId('stmt'),
    kind: 'statement',
    label: snippet(sourceFile, init),
    text: init.getText(sourceFile).trim(),
  })
  return { entry: node.id, exit: node.id }
}

function buildForInOf(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.ForInStatement | ts.ForOfStatement,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  const head = builder.addNode({
    id: builder.nextId('branch'),
    kind: 'branch',
    label:
      stmt.kind === ts.SyntaxKind.ForOfStatement
        ? `for…of (${snippet(sourceFile, stmt.expression)})`
        : `for…in (${snippet(sourceFile, stmt.expression)})`,
    location: getLocation(sourceFile, stmt.expression),
    text: stmt.expression.getText(sourceFile),
  })
  const exit = builder.addNode({
    id: builder.nextId('loop-exit'),
    kind: 'merge',
    label: '(loop exit)',
  })
  const body = buildStatement(sourceFile, builder, stmt.statement, loops, ctx)
  builder.addEdge(head.id, body.entry, 'true')
  builder.addEdge(head.id, exit.id, 'false')
  if (body.exit !== undefined) {
    builder.addEdge(body.exit, head.id, 'next')
  }
  return { entry: head.id, exit: exit.id }
}

function buildSwitch(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.SwitchStatement,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  const dispatch = builder.addNode({
    id: builder.nextId('switch'),
    kind: 'switch',
    label: `switch (${snippet(sourceFile, stmt.expression)})`,
    location: getLocation(sourceFile, stmt.expression),
    text: stmt.expression.getText(sourceFile),
  })
  const exit = builder.addNode({
    id: builder.nextId('switch-exit'),
    kind: 'merge',
    label: '(switch exit)',
  })

  let lastClauseExit: string | undefined = undefined

  for (const clause of stmt.caseBlock.clauses) {
    let entryKind: CfgNodeKind
    let entryLabel: string
    let entryText: string | undefined
    let entryLoc: SourceLocation | undefined
    if (ts.isCaseClause(clause)) {
      entryKind = 'case'
      entryLabel = `case ${snippet(sourceFile, clause.expression)}:`
      entryText = clause.getText(sourceFile).split('\n')[0]?.trim() ?? entryLabel
      entryLoc = getLocation(sourceFile, clause.expression)
    } else {
      entryKind = 'default'
      entryLabel = 'default:'
      entryText = 'default:'
    }
    const clauseEntry = builder.addNode({
      id: builder.nextId(entryKind),
      kind: entryKind,
      label: entryLabel,
      ...(entryLoc !== undefined ? { location: entryLoc } : {}),
      ...(entryText !== undefined ? { text: entryText } : {}),
    })

    // Link dispatch to this clause. For the default clause we also emit
    // a 'default'-tagged edge in addition to a normal one.
    builder.addEdge(dispatch.id, clauseEntry.id, entryKind === 'case' ? 'case' : 'default')

    if (lastClauseExit !== undefined) {
      builder.addEdge(lastClauseExit, clauseEntry.id, 'next')
    }

    const bodySeq = buildStatementList(sourceFile, builder, clause.statements, loops, ctx)
    if (bodySeq.entry !== undefined) {
      builder.addEdge(clauseEntry.id, bodySeq.entry, 'next')
    }
    // Fall-through: a clause with no terminating statement links to the next
    // clause's entry via the clauseEntry node itself. We tracked the
    // lastClauseExit above so the next iteration can wire it up.
    lastClauseExit = bodySeq.exit ?? clauseEntry.id
  }

  // All clauses (including a no-op default) fall through to the switch
  // exit on a normal exit; breaks land here too via their own edges.
  if (lastClauseExit !== undefined) {
    builder.addEdge(lastClauseExit, exit.id, 'next')
  }
  // If the discriminant doesn't match anything and there is no default,
  // dispatch can still reach exit directly.
  builder.addEdge(dispatch.id, exit.id, 'next')
  return { entry: dispatch.id, exit: exit.id }
}

function buildTry(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.TryStatement,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  const tryEntry = builder.addNode({
    id: builder.nextId('try'),
    kind: 'try',
    label: 'try',
    location: getLocation(sourceFile, stmt.tryBlock),
  })
  const tryBody = buildBlock(sourceFile, builder, stmt.tryBlock, loops, ctx)
  builder.addEdge(tryEntry.id, tryBody.entry, 'next')

  const postTry = builder.addNode({
    id: builder.nextId('merge'),
    kind: 'merge',
    label: '(after try)',
  })

  const tryExit: string | undefined = tryBody.exit
  if (tryExit !== undefined) {
    builder.addEdge(tryExit, postTry.id, 'next')
  }

  if (stmt.catchClause !== undefined) {
    const catchName =
      stmt.catchClause.variableDeclaration !== undefined
        ? paramName(stmt.catchClause.variableDeclaration)
        : undefined
    const catchEntry = builder.addNode({
      id: builder.nextId('catch'),
      kind: 'catch',
      label: catchName !== undefined ? `catch (${catchName})` : 'catch',
      location: getLocation(sourceFile, stmt.catchClause),
    })
    builder.addEdge(tryEntry.id, catchEntry.id, 'unwind')
    const catchBody = buildBlock(sourceFile, builder, stmt.catchClause.block, loops, ctx)
    builder.addEdge(catchEntry.id, catchBody.entry, 'next')
    if (catchBody.exit !== undefined) {
      builder.addEdge(catchBody.exit, postTry.id, 'next')
    }
  }

  if (stmt.finallyBlock !== undefined) {
    const finallyEntry = builder.addNode({
      id: builder.nextId('finally'),
      kind: 'finally',
      label: 'finally',
      location: getLocation(sourceFile, stmt.finallyBlock),
    })
    // Connect every terminal we know of into the finally block.
    builder.addEdge(tryEntry.id, finallyEntry.id, 'unwind')
    builder.addEdge(postTry.id, finallyEntry.id, 'next')
    const finallyBody = buildBlock(sourceFile, builder, stmt.finallyBlock, loops, ctx)
    builder.addEdge(finallyEntry.id, finallyBody.entry, 'next')
    // The finally block's own exit is our final exit; if it terminates
    // the surrounding sequence also terminates.
    return { entry: tryEntry.id, exit: finallyBody.exit ?? undefined }
  }

  return { entry: tryEntry.id, exit: postTry.id }
}

function buildLabeled(
  sourceFile: ts.SourceFile,
  builder: CfgBuilder,
  stmt: ts.LabeledStatement,
  loops: ReadonlyArray<LoopContext>,
  ctx: StatementContext,
): { entry: string; exit: string | undefined } {
  const inner = buildStatement(sourceFile, builder, stmt.statement, loops, ctx)
  // Attach the label to the inner loop's context by promoting it onto
  // the new top frame: we can't easily mutate the inner loop context, so
  // for labelled `if`/etc. we simply add the label as an annotation on
  // the first node. The label is still visible via text + location.
  const first = builder.nodes.find((n) => n.id === inner.entry)
  if (first !== undefined) {
    const idx = builder.nodes.indexOf(first)
    const annotated: CfgNode = { ...first, label: `${stmt.label.text}: ${first.label}` }
    builder.nodes[idx] = annotated
  }
  return inner
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function getLocation(
  sourceFile: ts.SourceFile,
  node: ts.Node | undefined,
): SourceLocation | undefined {
  if (node === undefined) return undefined
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
  return {
    start: { line: start.line + 1, column: start.character + 1 },
    end: { line: end.line + 1, column: end.character + 1 },
  }
}

function snippet(sourceFile: ts.SourceFile, node: ts.Node): string {
  return node.getText(sourceFile).replace(/\s+/g, ' ').trim()
}

function statementKindLabel(stmt: ts.Statement): string {
  switch (stmt.kind) {
    case ts.SyntaxKind.VariableStatement:
      return 'var'
    case ts.SyntaxKind.ExpressionStatement:
      return 'expr'
    case ts.SyntaxKind.EmptyStatement:
      return ';'
    case ts.SyntaxKind.TypeAliasDeclaration:
      return 'type'
    case ts.SyntaxKind.InterfaceDeclaration:
      return 'interface'
    case ts.SyntaxKind.ClassDeclaration:
      return 'class'
    case ts.SyntaxKind.EnumDeclaration:
      return 'enum'
    case ts.SyntaxKind.ModuleDeclaration:
      return 'module'
    case ts.SyntaxKind.ImportDeclaration:
      return 'import'
    case ts.SyntaxKind.ExportAssignment:
      return 'export ='
    case ts.SyntaxKind.ExportDeclaration:
      return 'export {}'
    default:
      return ts.SyntaxKind[stmt.kind] ?? 'stmt'
  }
}