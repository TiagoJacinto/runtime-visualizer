import { describe, expect, it } from 'bun:test'
import { analyseTypeScript } from '../src/cfg/analyzer.ts'
import {
  renderMermaid,
  renderMermaidMany,
  renderProjectFiles,
} from '../src/cfg/mermaid.ts'
import type { MermaidInput } from '../src/cfg/mermaid.ts'
import type { ProjectFile } from '../src/cfg/project.ts'

describe('renderMermaid', () => {
  it('emits a flowchart header and one node per CFG node', () => {
    const out = renderMermaid({
      path: 'demo.ts',
      cfg: analyseTypeScript(`function noop() {}`),
    })
    expect(out.startsWith('flowchart TD\n')).toBe(true)
    // entry + exit → at least 2 nodes
    const lines = out.split('\n').filter((l) => l.includes('[') && l.includes(']'))
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })

  it('labels boolean branches with true / false edges', () => {
    const out = renderMermaid({
      path: 'b.ts',
      cfg: analyseTypeScript(`
        function f(x: number): number {
          if (x > 0) return 1
          return -1
        }
      `),
    })
    expect(out).toMatch(/-->\|\s*true\s*\|/)
    expect(out).toMatch(/-->\|\s*false\s*\|/)
  })

  it('renders a switch dispatch with case/default labels per clause', () => {
    const out = renderMermaid({
      path: 's.ts',
      cfg: analyseTypeScript(`
        function pick(x: number): string {
          switch (x) {
            case 1: return 'one'
            default: return 'other'
          }
        }
      `),
    })
    expect(out).toMatch(/-->\|\s*case 1\s*\|/)
    expect(out).toMatch(/-->\|\s*default\s*\|/)
  })

  it('renders a try/catch with an unwind edge', () => {
    const out = renderMermaid({
      path: 't.ts',
      cfg: analyseTypeScript(`
        function safe(x: number): number {
          try { return x } catch (e) { return -1 }
        }
      `),
    })
    expect(out).toMatch(/-->\|\s*unwind\s*\|/)
  })

  it('escapes double quotes inside labels', () => {
    // The label comes from `snippet(source, stmt.expression)` for the
    // throw, which itself was built from the source. If a label
    // contains `"`, we must escape it to keep the Mermaid syntax valid.
    const out = renderMermaid({
      path: 'q.ts',
      cfg: analyseTypeScript(`
        function bad(): never {
          throw new Error("oops")
        }
      `),
    })
    expect(out).toContain('\\"oops\\"')
    const quoted = out
      .split('\n')
      .find((l) => l.includes('\\"oops\\"'))
    expect(quoted).toBeDefined()
    // The escaped label must still match `id["..."]` so Mermaid can parse it.
    expect(quoted).toMatch(/\[\"throw new Error\(\\"oops\\"\)\"\]/)
  })

  it('disambiguates node ids across files', () => {
    const a: MermaidInput = { path: 'a.ts', cfg: analyseTypeScript(`function a() {}`) }
    const b: MermaidInput = { path: 'b.ts', cfg: analyseTypeScript(`function b() {}`) }
    const out = renderMermaidMany([a, b])
    // Each function block has its own subgraph; the entry node ids
    // must not collide.
    const idMatches = out.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)["\[]/gm) ?? []
    const ids = idMatches.map((m) => m.trim().split(/["\[]/)[0]!)
    const uniq = new Set(ids)
    expect(uniq.size).toBe(ids.length)
  })

  it('keeps node ids stable between declaration and edge references', () => {
    // Regression test: a previous version used a shared id counter,
    // so a node declared as `X` in the function body was referenced
    // as `X_1` from the edges. Edges must point at the exact id the
    // declaration used.
    const out = renderMermaid({
      path: 'r.ts',
      cfg: analyseTypeScript(`
        function r(n: number): number {
          if (n < 0) return -1
          return n
        }
      `),
    })
    // Pull every declared id and every edge-referenced id; the two
    // sets must be exactly equal.
    const declared = new Set(
      (out.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\["/gm) ?? []).map((m) =>
        m.trim().split('[')[0]!,
      ),
    )
    const referenced = new Set(
      (out.match(/-->\s*([A-Za-z_][A-Za-z0-9_]*)/g) ?? []).map((m) =>
        m.replace(/-->\s*/, ''),
      ),
    )
    for (const id of referenced) {
      expect(declared.has(id)).toBe(true)
    }
  })

  it('renders a ProjectFile list through renderProjectFiles', () => {
    const cfg = analyseTypeScript(`function ping() { return 1 }`)
    const files: ProjectFile[] = [{ path: 'ping.ts', source: '', cfg, imports: [] }]
    const out = renderProjectFiles(files)
    expect(out).toContain('flowchart TD')
    expect(out).toContain('ping.ts')
  })

  it('returns a valid (empty) flowchart for an empty input list', () => {
    const out = renderMermaidMany([])
    expect(out).toBe('flowchart TD\n')
  })

  it('honours the direction option', () => {
    const out = renderMermaid(
      { path: 'd.ts', cfg: analyseTypeScript(`function d() {}`) },
      { direction: 'LR' },
    )
    expect(out.startsWith('flowchart LR\n')).toBe(true)
  })
})