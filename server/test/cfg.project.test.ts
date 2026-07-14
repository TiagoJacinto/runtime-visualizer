import { describe, expect, it } from 'bun:test'
import * as path from 'node:path'
import { buildProjectCfg, ProjectCfgError } from '../src/cfg/project.ts'

const FIXTURES = path.resolve(import.meta.dir, '..', '..', 'target', 'fixtures')

describe('buildProjectCfg', () => {
  it('walks the transitive local-import graph from the entry file', async () => {
    const project = await buildProjectCfg('entry.ts', { root: FIXTURES })
    expect(project.entry).toBe('entry.ts')
    const paths = project.files.map((f) => f.path)
    expect(paths).toContain('entry.ts')
    expect(paths).toContain('mid.ts')
    expect(paths).toContain('leaf.ts')
    // Unrelated files are NOT pulled in.
    expect(paths).toHaveLength(3)
  })

  it('records the per-file CFG with the relative filePath attached', async () => {
    const project = await buildProjectCfg('entry.ts', { root: FIXTURES })
    const entry = project.files.find((f) => f.path === 'entry.ts')!
    expect(entry.cfg.filePath).toBe('entry.ts')
    expect(entry.cfg.functions.some((f) => f.name === 'run')).toBe(true)
  })

  it('returns the local-only adjacency list in `graph`', async () => {
    const project = await buildProjectCfg('entry.ts', { root: FIXTURES })
    expect(project.graph['entry.ts']).toEqual(['mid.ts'])
    expect(project.graph['mid.ts']).toEqual(['leaf.ts'])
    expect(project.graph['leaf.ts']).toEqual([])
  })

  it('marks bare specifiers as external and does not follow them', async () => {
    const project = await buildProjectCfg('entry.ts', { root: FIXTURES })
    const entry = project.files.find((f) => f.path === 'entry.ts')!
    const ext = entry.imports.find((i) => i.specifier === 'some-pkg')!
    expect(ext.status).toBe('external')
    expect(ext.resolved).toBeNull()
    // The bare specifier must not appear in the local adjacency list.
    expect(project.graph['entry.ts']).not.toContain('some-pkg')
  })

  it('marks unresolved local imports as missing and skips them', async () => {
    const project = await buildProjectCfg('entry.ts', { root: FIXTURES })
    const entry = project.files.find((f) => f.path === 'entry.ts')!
    const missing = entry.imports.filter((i) => i.status === 'missing')
    expect(missing.map((i) => i.specifier).sort()).toEqual([
      './also-missing.ts',
      './missing.ts',
    ])
    for (const m of missing) {
      expect(m.resolved).toBeNull()
    }
    // Missing files must not show up in `files` or `graph`.
    expect(project.files.map((f) => f.path)).not.toContain('missing.ts')
    expect(project.files.map((f) => f.path)).not.toContain('also-missing.ts')
  })

  it('tracks type-only imports', async () => {
    const project = await buildProjectCfg('entry.ts', { root: FIXTURES })
    const entry = project.files.find((f) => f.path === 'entry.ts')!
    const typeOnly = entry.imports.find((i) => i.specifier === './also-missing.ts')!
    expect(typeOnly.isTypeOnly).toBe(true)
    const valueImport = entry.imports.find((i) => i.specifier === './missing.ts')!
    expect(valueImport.isTypeOnly).toBe(false)
  })

  it('refuses entries that escape the project root', async () => {
    await expect(
      buildProjectCfg('../package.json', { root: FIXTURES }),
    ).rejects.toThrow(ProjectCfgError)
  })

  it('refuses entries that are not .ts files', async () => {
    await expect(
      buildProjectCfg('leaf.js', { root: FIXTURES }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('reports 404 when the entry file does not exist', async () => {
    await expect(
      buildProjectCfg('does-not-exist.ts', { root: FIXTURES }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('handles a single-file project (no imports)', async () => {
    const project = await buildProjectCfg('leaf.ts', { root: FIXTURES })
    expect(project.files.map((f) => f.path)).toEqual(['leaf.ts'])
    expect(project.graph['leaf.ts']).toEqual([])
  })

  it('does not loop forever on a self-import', async () => {
    // The walker must not re-enqueue a file already in `visited`.
    const project = await buildProjectCfg('entry.ts', { root: FIXTURES })
    const counts = new Map<string, number>()
    for (const f of project.files) {
      counts.set(f.path, (counts.get(f.path) ?? 0) + 1)
    }
    for (const [, n] of counts) {
      expect(n).toBe(1)
    }
  })

  it('respects the maxFiles cap by stopping early', async () => {
    const project = await buildProjectCfg('entry.ts', {
      root: FIXTURES,
      maxFiles: 1,
    })
    expect(project.files).toHaveLength(1)
    expect(project.files[0]?.path).toBe('entry.ts')
  })
})