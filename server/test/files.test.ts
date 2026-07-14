import { describe, expect, it } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createApp } from '../src/app.ts'
import { loadSettings } from '../src/settings.ts'
import { call } from './helpers.ts'

/** Creates a temp dir, runs `fn` with its absolute path, then cleans up. */
async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'files-test-'))
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

/** Creates a nested temp dir `parent/child`, returns the child path. */
async function withNestedTempDir<T>(fn: (parent: string, child: string) => Promise<T>): Promise<T> {
  return withTempDir(async (parent) => {
    const child = path.join(parent, 'src', 'inner')
    await fs.mkdir(child, { recursive: true })
    return fn(parent, child)
  })
}

describe('GET /api/files', () => {
  it('returns the configured folder contents as forward-slash relative paths', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'a.ts'), 'export const a = 1\n')
      await fs.mkdir(path.join(dir, 'sub'))
      await fs.writeFile(path.join(dir, 'sub', 'b.ts'), 'export const b = 2\n')
      await fs.mkdir(path.join(dir, 'sub', 'deep'))
      await fs.writeFile(path.join(dir, 'sub', 'deep', 'c.ts'), 'export const c = 3\n')

      const app = await createApp({ filesFolder: dir })
      const res = await call(app, 'GET', '/api/files')
      expect(res.status).toBe(200)
      expect(res.body).toEqual(['sub/deep/c.ts', 'sub/b.ts', 'a.ts'])
    })
  })

  it('returns [] for an empty folder', async () => {
    await withTempDir(async (dir) => {
      const app = await createApp({ filesFolder: dir })
      const res = await call(app, 'GET', '/api/files')
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })

  it('returns [] when the configured folder does not exist', async () => {
    await withTempDir(async (dir) => {
      const missing = path.join(dir, 'does-not-exist')
      const app = await createApp({ filesFolder: missing })
      const res = await call(app, 'GET', '/api/files')
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })

  it('lists directories before files within each level (deterministic order)', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'z.ts'), '')
      await fs.mkdir(path.join(dir, 'a-dir'))
      await fs.writeFile(path.join(dir, 'a-dir', 'inner.ts'), '')

      const app = await createApp({ filesFolder: dir })
      const res = await call(app, 'GET', '/api/files')
      expect(res.body).toEqual(['a-dir/inner.ts', 'z.ts'])
    })
  })

  it('skips symbolic links', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'real.ts'), 'export const r = 1\n')
      await fs.symlink(path.join(dir, 'real.ts'), path.join(dir, 'link.ts'))

      const app = await createApp({ filesFolder: dir })
      const res = await call(app, 'GET', '/api/files')
      expect(res.body).toEqual(['real.ts'])
    })
  })

  it('skips dangling symbolic links', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'real.ts'), '')
      await fs.symlink(path.join(dir, 'does-not-exist.ts'), path.join(dir, 'dangling.ts'))

      const app = await createApp({ filesFolder: dir })
      const res = await call(app, 'GET', '/api/files')
      expect(res.body).toEqual(['real.ts'])
    })
  })

  it('returns 500 when filesFolder points at a regular file, not a directory', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'not-a-folder.ts')
      await fs.writeFile(file, '')
      const app = await createApp({ filesFolder: file })
      const res = await call(app, 'GET', '/api/files')
      expect(res.status).toBe(500)
      expect((res.body as { error: string }).error).toMatch(/ENOTDIR|Not a directory/i)
    })
  })

  it('returns unicode filenames in their original encoding', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'açaí.ts'), '')
      await fs.writeFile(path.join(dir, '🦊.ts'), '')

      const app = await createApp({ filesFolder: dir })
      const res = await call(app, 'GET', '/api/files')
      const body = res.body as string[]
      expect(body).toContain('açaí.ts')
      expect(body).toContain('🦊.ts')
      expect(body).toHaveLength(2)
    })
  })
})

describe('loadSettings', () => {
  it('reads settings.json from the startDir when present', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ filesFolder: './foo' }))
      const settings = loadSettings(dir)
      expect(settings.filesFolder).toBe(path.join(dir, 'foo'))
    })
  })

  it('walks up the directory tree to find settings.json', async () => {
    await withNestedTempDir(async (parent, child) => {
      await fs.writeFile(path.join(parent, 'settings.json'), JSON.stringify({ filesFolder: './walked' }))
      const settings = loadSettings(child)
      expect(settings.filesFolder).toBe(path.join(parent, 'walked'))
    })
  })

  it('resolves a relative filesFolder against the directory holding settings.json', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ filesFolder: '../up' }))
      const settings = loadSettings(dir)
      expect(settings.filesFolder).toBe(path.join(dir, '..', 'up'))
    })
  })

  it('falls back to <startDir>/target when no settings.json is found', async () => {
    await withNestedTempDir(async (_parent, child) => {
      const settings = loadSettings(child)
      expect(settings.filesFolder).toBe(path.join(child, 'target'))
    })
  })

  it('uses the default filesFolder when settings.json has no filesFolder key', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'settings.json'), '{}')
      const settings = loadSettings(dir)
      expect(settings.filesFolder).toBe(path.join(dir, 'target'))
    })
  })

  it('throws on a malformed settings.json (non-object)', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'settings.json'), '"oops"')
      expect(() => loadSettings(dir)).toThrow(/Invalid settings\.json/)
    })
  })

  it('throws on a malformed settings.json (non-string filesFolder)', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'settings.json'), '{"filesFolder": 42}')
      expect(() => loadSettings(dir)).toThrow(/Invalid settings\.json/)
    })
  })

  it('throws on an empty filesFolder string', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'settings.json'), '{"filesFolder": ""}')
      expect(() => loadSettings(dir)).toThrow(/Invalid settings\.json/)
    })
  })
})