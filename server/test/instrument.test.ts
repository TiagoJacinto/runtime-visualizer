/**
 * Tests for the CFG-driven instrumentation module.
 *
 * The pure-function side of the pipeline (splicing send-calls into
 * a source string) gets a focused unit test; the orchestration and
 * route integration are exercised separately in
 * `instrument.route.test.ts`.
 */
import { describe, expect, it } from 'bun:test'
import { instrument, PRELUDE } from '../src/instrument/instrument.ts'

describe('instrument()', () => {
  it('prepends the dispatcher prelude', () => {
    const out = instrument('export const x = 1;\n', 'demo.ts')
    expect(out.startsWith(PRELUDE)).toBe(true)
    expect(out).toContain('__visualizer_send')
  })

  it('emits a send call before variable declarations', () => {
    const out = instrument('export function run(): void { const upper = 15; }\n', 'demo.ts')
    expect(out).toContain('__visualizer_send("statement"')
    expect(out).toContain('const upper = 15;')
  })

  it('emits an `if` send inside the then-block of an if-statement', () => {
    const src = [
      'export function f(x: number): void {',
      '  if (x > 0) console.log("pos");',
      '}',
      '',
    ].join('\n')
    const out = instrument(src, 'demo.ts')
    expect(out).toContain('__visualizer_send("if"')
    // The then-statement is wrapped in `{ send(...); <orig> }` so the
    // outer `else`/`else if` (if any) still binds to the right `if`.
    expect(out).toMatch(/if\s*\(x > 0\)\s*\{\s*__visualizer_send\("if"/)
    expect(out).toContain('console.log("pos");')
  })

  it('handles the FizzBuzz sample from the spec', () => {
    const src = [
      'export function run(): void {',
      '  const upper = 15;',
      '  for (let i = 1; i <= upper; i++) {',
      '    let result;',
      '    if (i % 15 === 0)      result = "FizzBuzz";',
      '    else if (i % 3 === 0)  result = "Fizz";',
      '    else if (i % 5 === 0)  result = "Buzz";',
      '    else                   result = String(i);',
      '    console.log(result);',
      '  }',
      '}',
      '',
    ].join('\n')
    const out = instrument(src, 'file1.ts')
    // At minimum we expect: one statement send for the var declaration,
    // one `if` send per `if`/`else if`/`else`, and a statement send
    // for the call. The `if`s are wrapped in `{ send(...); <body> }`,
    // which keeps `else if` binding intact.
    expect(out).toContain('__visualizer_send("if"')
    expect(out).toContain('__visualizer_send("statement"')
    // Original source lines are preserved verbatim (just possibly
    // wrapped in { ... }).
    expect(out).toContain('const upper = 15;')
    expect(out).toContain('if (i % 15 === 0)')
    expect(out).toContain('console.log(result);')
    // And the wrapping keeps `else if` chained to the original `if`,
    // not to the inserted send call. The send is inside the
    // wrapped then-block (between the `if (cond)` and the `else`),
    // not between the `if` and `else if`.
    expect(out).toMatch(/if\s*\(i % 15 === 0\)[^{]*\{\s*__visualizer_send\("if"/)
    expect(out).toMatch(/__visualizer_send\("if",\s*\{"cond":"i % 3 === 0","id":"branch_\d+"\}/)
    expect(out).toMatch(/__visualizer_send\("if",\s*\{"cond":"i % 5 === 0","id":"branch_\d+"\}/)
  })

  it('produces the same output for the same input (deterministic)', () => {
    const src = 'export function f(x: number) { return x + 1; }\n'
    const a = instrument(src, 'a.ts')
    const b = instrument(src, 'a.ts')
    expect(a).toBe(b)
  })

  it('emits `return` events before return statements', () => {
    const src = 'export function f(): number { return 42; }\n'
    const out = instrument(src, 'demo.ts')
    expect(out).toContain('__visualizer_send("return"')
    expect(out).toContain('return 42;')
  })
})