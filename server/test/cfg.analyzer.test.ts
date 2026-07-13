import { describe, expect, it } from 'bun:test'
import { analyseTypeScript } from '../src/cfg/analyzer.ts'
import type { CfgEdge, FunctionCfg } from '../src/cfg/types.ts'

function findNode(fn: FunctionCfg, kind: string): { id: string; label: string } {
  const node = fn.nodes.find((n) => n.kind === kind)
  if (node === undefined) {
    throw new Error(
      `no node of kind ${kind} found in ${fn.name}; kinds=${fn.nodes.map((n) => n.kind).join(',')}`,
    )
  }
  return { id: node.id, label: node.label }
}

function outgoingEdges(fn: FunctionCfg, fromId: string): CfgEdge[] {
  return fn.edges.filter((e) => e.from === fromId)
}

function targetIds(edges: CfgEdge[]): string[] {
  return edges.map((e) => e.to)
}

describe('analyseTypeScript', () => {
  it('produces entry and exit nodes for an empty function', () => {
    const { functions } = analyseTypeScript(`function empty() {}`)
    expect(functions).toHaveLength(1)
    const fn = functions[0]!
    expect(fn.name).toBe('empty')
    expect(fn.params).toEqual([])
    expect(fn.nodes.map((n) => n.kind)).toEqual(['entry', 'exit'])
    expect(targetIds(outgoingEdges(fn, fn.entry))).toContain(fn.exit)
  })

  it('emits straight-line statement nodes for sequential code', () => {
    const { functions } = analyseTypeScript(`
      function linear(): number {
        const a = 1
        const b = 2
        return a + b
      }
    `)
    const fn = functions[0]!
    expect(fn.name).toBe('linear')
    expect(fn.params).toEqual([])
    const kinds = fn.nodes.map((n) => n.kind)
    expect(kinds).toContain('statement')
    expect(kinds).toContain('return')

    const returnNode = fn.nodes.find((n) => n.kind === 'return')!
    expect(outgoingEdges(fn, returnNode.id).map((e) => e.to)).toEqual([fn.exit])
  })

  it('builds a branch + merge for if/else with both branches', () => {
    const { functions } = analyseTypeScript(`
      function branchy(x: number): string {
        if (x > 0) {
          return 'positive'
        } else {
          return 'negative'
        }
      }
    `)
    const fn = functions[0]!
    const branch = findNode(fn, 'branch')
    expect(branch.label).toContain('if (x > 0)')

    const edges = outgoingEdges(fn, branch.id)
    expect(edges.find((e) => e.kind === 'true')).toBeDefined()
    expect(edges.find((e) => e.kind === 'false')).toBeDefined()
  })

  it('builds a loop with a back edge for while', () => {
    const { functions } = analyseTypeScript(`
      function loop(n: number): number {
        let sum = 0
        let i = 0
        while (i < n) {
          sum += i
          i++
        }
        return sum
      }
    `)
    const fn = functions[0]!
    const branch = findNode(fn, 'branch')
    expect(branch.label).toContain('while')

    // There must be a back edge from some body node back to the loop
    // head (kind 'branch' with the while label).
    const backEdge = fn.edges.find((e) => e.to === branch.id)
    expect(backEdge).toBeDefined()
  })

  it('handles for(;;) with an update tail', () => {
    const { functions } = analyseTypeScript(`
      function count(n: number): number {
        let s = 0
        for (let i = 0; i < n; i++) {
          s += i
        }
        return s
      }
    `)
    const fn = functions[0]!
    const labels = fn.nodes.map((n) => n.label)
    expect(labels.some((l) => l.startsWith('for ('))).toBe(true)
  })

  it('models switch with case fall-through and a default clause', () => {
    const { functions } = analyseTypeScript(`
      function pick(x: number): string {
        switch (x) {
          case 1:
            return 'one'
          case 2:
          case 3:
            return 'two-or-three'
          default:
            return 'other'
        }
      }
    `)
    const fn = functions[0]!
    const dispatch = findNode(fn, 'switch')
    expect(dispatch.label).toContain('switch (x)')

    const cases = fn.nodes.filter((n) => n.kind === 'case' || n.kind === 'default')
    expect(cases).toHaveLength(4) // case 1, case 2, case 3, default

    const dispatchEdges = outgoingEdges(fn, dispatch.id)
    const caseEdges = dispatchEdges.filter((e) => e.kind === 'case')
    const defaultEdge = dispatchEdges.find((e) => e.kind === 'default')
    expect(caseEdges).toHaveLength(3)
    expect(defaultEdge).toBeDefined()

    // Verify case 2 falls through to case 3: case 2 has no statement of
    // its own, so its exit falls through to the next clause's entry.
    const case2 = cases.find((n) => n.kind === 'case' && n.label === 'case 2:')!
    const case3 = cases.find((n) => n.kind === 'case' && n.label === 'case 3:')!
    const fallthrough = fn.edges.find((e) => e.from === case2.id && e.to === case3.id)
    expect(fallthrough).toBeDefined()
  })

  it('models try/catch with an unwind edge from try to catch', () => {
    const { functions } = analyseTypeScript(`
      function safe(x: number): number {
        try {
          if (x < 0) throw new Error('bad')
          return x
        } catch (e) {
          return -1
        }
      }
    `)
    const fn = functions[0]!
    const tryNode = findNode(fn, 'try')
    const catchNode = findNode(fn, 'catch')

    const unwind = fn.edges.find(
      (e) => e.from === tryNode.id && e.to === catchNode.id && e.kind === 'unwind',
    )
    expect(unwind).toBeDefined()
  })

  it('handles for-of with a body that can return', () => {
    const { functions } = analyseTypeScript(`
      function firstEven(xs: number[]): number {
        for (const x of xs) {
          if (x % 2 === 0) return x
        }
        return -1
      }
    `)
    const fn = functions[0]!
    expect(fn.nodes.some((n) => n.label.startsWith('for…of'))).toBe(true)
  })

  it('handles nested function declarations as separate FunctionCfgs', () => {
    const { functions } = analyseTypeScript(`
      function outer(): void {
        function inner(): number {
          return 42
        }
        inner()
      }
    `)
    expect(functions.map((f) => f.name)).toEqual(['outer', 'inner'])
    const inner = functions.find((f) => f.name === 'inner')!
    expect(inner.nodes.map((n) => n.kind)).toContain('return')
  })

  it('uses the parent name for arrow functions assigned to a const', () => {
    const { functions } = analyseTypeScript(`
      const add = (a: number, b: number) => a + b
      const obj = { mul: function (a: number, b: number) { return a * b } }
    `)
    expect(functions.map((f) => f.name)).toEqual(['add', 'mul'])
    const add = functions.find((f) => f.name === 'add')!
    expect(add.params).toEqual(['a', 'b'])
    expect(add.isAsync).toBe(false)
  })

  it('flags isAsync / isGenerator correctly', () => {
    const { functions } = analyseTypeScript(`
      async function a() {}
      function* g() { yield 1 }
    `)
    const afn = functions.find((f) => f.name === 'a')!
    const gfn = functions.find((f) => f.name === 'g')!
    expect(afn.isAsync).toBe(true)
    expect(afn.isGenerator).toBe(false)
    expect(gfn.isAsync).toBe(false)
    expect(gfn.isGenerator).toBe(true)
  })

  it('attaches a source location to relevant nodes', () => {
    const { functions } = analyseTypeScript(`
      function withLoc() {
        const a = 1
        if (a > 0) return
      }
    `)
    const fn = functions[0]!
    const ret = fn.nodes.find((n) => n.kind === 'return')!
    expect(ret.location).toBeDefined()
    expect(ret.location!.start.line).toBeGreaterThan(0)
    expect(ret.location!.end.line).toBeGreaterThanOrEqual(ret.location!.start.line)
  })

  it('produces an empty function list for a file with no functions', () => {
    const { functions } = analyseTypeScript(`const x = 1\ntype T = string\n`)
    expect(functions).toEqual([])
  })

  it('uses the parent name for a named function expression', () => {
    const { functions } = analyseTypeScript(`
      const f = function () {}
    `)
    expect(functions[0]?.name).toBe('f')
  })

  it('records do-while as body-first then condition', () => {
    const { functions } = analyseTypeScript(`
      function dw(): void {
        let i = 0
        do {
          i++
        } while (i < 3)
      }
    `)
    const fn = functions[0]!
    expect(fn.nodes.some((n) => n.label.startsWith('do-while'))).toBe(true)
  })

  it('routes for-loop body exit to the incrementor, not the initializer', () => {
    // Regression test for the bug where body.exit was wired to the
    // initializer instead of the incrementor, causing the init to
    // re-execute every iteration.
    const { functions } = analyseTypeScript(`
      function count(n: number): number {
        let s = 0
        for (let i = 0; i < n; i++) {
          s += i
        }
        return s
      }
    `)
    const fn = functions[0]!
    const head = fn.nodes.find((n) => n.kind === 'branch' && n.label.startsWith('for ('))!
    // Find the incrementor statement (text `i++`).
    const incr = fn.nodes.find(
      (n) => n.kind === 'statement' && n.text !== undefined && n.text.trim() === 'i++',
    )!
    // Find the initializer (`i = 0`, since the `let` keyword is stripped
    // from the snippet text).
    const init = fn.nodes.find(
      (n) => n.kind === 'statement' && n.text !== undefined && n.text.trim() === 'i = 0',
    )!
    // The body exit must reach the incrementor, and the incrementor must
    // then reach the head.
    const bodyToIncr = fn.edges.find(
      (e) => e.to === incr.id && fn.nodes.some((n) => n.id === e.from && n.kind !== 'branch'),
    )
    expect(bodyToIncr).toBeDefined()
    const incrToHead = fn.edges.find(
      (e) => e.from === incr.id && e.to === head.id && e.kind === 'next',
    )
    expect(incrToHead).toBeDefined()
    // The body must not flow back into the initializer. The body here is
    // `s += i` (a non-branch statement node whose text is `s += i`); any
    // edge from it into `init` would re-run the initializer each
    // iteration.
    const body = fn.nodes.find(
      (n) => n.kind === 'statement' && n.text !== undefined && n.text.trim() === 's += i',
    )!
    const initFromBody = fn.edges.find((e) => e.to === init.id && e.from === body.id)
    expect(initFromBody).toBeUndefined()
  })

  it('records break as a terminator that jumps to the loop exit', () => {
    const { functions } = analyseTypeScript(`
      function until(xs: number[]): number {
        for (const x of xs) {
          if (x === 0) break
        }
        return 0
      }
    `)
    const fn = functions[0]!
    const breakNode = fn.nodes.find((n) => n.kind === 'break')
    expect(breakNode).toBeDefined()
    // The break node must have an outgoing edge to the loop exit merge.
    // Pull the exit id from the break node's own edge rather than
    // scanning by label, so the assertion is robust to nested loops.
    const breakEdges = outgoingEdges(fn, breakNode!.id)
    expect(breakEdges).toHaveLength(1)
    const exit = breakEdges[0]!.to
    const exitNode = fn.nodes.find((n) => n.id === exit)
    expect(exitNode?.kind).toBe('merge')
    expect(exitNode?.label).toBe('(loop exit)')
  })
})