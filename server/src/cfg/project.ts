/**
 * Project-aware control-flow-graph walker.
 *
 * Given an entry file under a project root, walks the local `.ts`
 * import graph transitively and produces a {@link ProjectCfg}:
 * one {@link ProjectFile} per visited module, each carrying its
 * source text and the per-function CFGs from {@link analyseTypeScript}.
 *
 * Only relative `./` and `../` specifiers are followed. Bare
 * specifiers (`typescript`, `node:fs`, …) are recorded as `external`
 * and skipped. Imports that resolve inside the root but don't exist
 * on disk are recorded as `missing` and skipped — that's what makes
 * the result "partial": if file1 imports file2 and file3 and file3
 * isn't on disk, the returned graph simply doesn't contain file3,
 * while the rest of the subgraph is still built.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as ts from 'typescript'
import { analyseTypeScript } from './analyzer.ts'
import type { ControlFlowGraph } from './types.ts'

/** What happened when we tried to follow an import specifier. */
export type ProjectImportStatus = 'ok' | 'external' | 'missing'

/** One import edge discovered in a visited file. */
export type ProjectImport = {
  /** The raw specifier as written in source (e.g. `"./constants.ts"`). */
  readonly specifier: string
  /** Whether the import was a type-only import. */
  readonly isTypeOnly: boolean
  /**
   * Path of the resolved file relative to the project root, or `null`
   * for external / missing imports.
   */
  readonly resolved: string | null
  readonly status: ProjectImportStatus
}

/** A single visited file in the project subgraph. */
export type ProjectFile = {
  /** Path relative to the project root (forward slashes). */
  readonly path: string
  /** The original source text. */
  readonly source: string
  /** The CFG produced for this file. */
  readonly cfg: ControlFlowGraph
  /** Every import edge discovered in this file. */
  readonly imports: ReadonlyArray<ProjectImport>
}

/** The CFG result for an entry file plus its transitive imports. */
export type ProjectCfg = {
  /** Entry path relative to the project root. */
  readonly entry: string
  /** Absolute project root used for resolution. */
  readonly root: string
  /**
   * Visited files in discovery order (entry first, then breadth-first).
   * `imports` on each file are the raw edges; use `graph` for the
   * filtered "only local & resolved" view.
   */
  readonly files: ReadonlyArray<ProjectFile>
  /**
   * Adjacency list of local-only, successfully-resolved imports.
   * Keys are relative paths; values are relative paths.
   */
  readonly graph: Record<string, ReadonlyArray<string>>
}

/** Options for {@link buildProjectCfg}. */
export type ProjectCfgOptions = {
  /** Project root (defaults to `<cwd>/target`). */
  readonly root?: string
  /**
   * Hard cap on visited files. The walker stops with a `partial`
   * result if the cap is hit; the returned `files` length is the
   * truth.
   */
  readonly maxFiles?: number
}

/** Error raised when the entry file can't be loaded or resolved. */
export class ProjectCfgError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ProjectCfgError'
    this.status = status
  }
}

/** Default cap used when callers don't supply one. */
export const DEFAULT_MAX_FILES = 256

/**
 * Builds the {@link ProjectCfg} for an entry file relative to the
 * project root.
 */
export async function buildProjectCfg(
  entry: string,
  options: ProjectCfgOptions = {},
): Promise<ProjectCfg> {
  const root = path.resolve(options.root ?? path.join(process.cwd(), 'target'))
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
  const entryRel = normaliseRelative(entry)
  const entryAbs = path.join(root, entryRel)

  if (!entryRel.endsWith('.ts')) {
    throw new ProjectCfgError(400, `Entry must be a .ts file (got "${entry}").`)
  }
  if (!isInsideRoot(root, entryAbs)) {
    throw new ProjectCfgError(400, `Entry "${entry}" escapes the project root.`)
  }
  try {
    await fs.access(entryAbs)
  } catch {
    throw new ProjectCfgError(
      404,
      `Entry file "${entry}" not found in project root ${root}.`,
    )
  }

  const visited = new Map<string, ProjectFile>()
  const queue: string[] = [entryRel]
  while (queue.length > 0) {
    const rel = queue.shift()!
    if (visited.has(rel)) continue
    // Cap is checked BEFORE adding so a hit on the cap doesn't leave
    // the result with a half-visited queue but no further enqueues.
    if (visited.size >= maxFiles) break

    const abs = path.join(root, rel)
    const source = await fs.readFile(abs, 'utf8')
    const rawEdges = extractRawImports(source, rel)
    const imports = await Promise.all(
      rawEdges.map((edge) => finaliseImport(edge, rel, root)),
    )

    const cfg = analyseTypeScript(source, { filePath: rel })
    visited.set(rel, { path: rel, source, cfg, imports })

    for (const edge of imports) {
      if (edge.status === 'ok' && edge.resolved !== null && !visited.has(edge.resolved)) {
        queue.push(edge.resolved)
      }
    }
  }

  const files = [...visited.values()]
  const graph: Record<string, ReadonlyArray<string>> = {}
  for (const file of files) {
    graph[file.path] = file.imports
      .filter((i): i is ProjectImport & { resolved: string } =>
        i.status === 'ok' && i.resolved !== null,
      )
      .map((i) => i.resolved)
  }

  return { entry: entryRel, root, files, graph }
}

// ---------------------------------------------------------------------------
// Import extraction
// ---------------------------------------------------------------------------

type RawImport = {
  readonly specifier: string
  readonly isTypeOnly: boolean
}

/**
 * Pulls every import/export-from specifier out of a source file via
 * the TypeScript AST. We classify (external vs local-resolved) and
 * existence-check afterwards so the AST pass stays pure.
 */
function extractRawImports(source: string, fileRel: string): ReadonlyArray<RawImport> {
  const sourceFile = ts.createSourceFile(
    fileRel,
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  const out: RawImport[] = []
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const spec = stmt.moduleSpecifier
      if (spec !== undefined && ts.isStringLiteral(spec)) {
        out.push({
          specifier: spec.text,
          isTypeOnly: stmt.importClause?.isTypeOnly === true,
        })
      }
      continue
    }
    if (ts.isExportDeclaration(stmt)) {
      const spec = stmt.moduleSpecifier
      if (spec !== undefined && ts.isStringLiteral(spec)) {
        out.push({
          specifier: spec.text,
          isTypeOnly: stmt.isTypeOnly === true,
        })
      }
    }
  }
  return out
}

/**
 * Resolves a raw import edge against the file's location and the
 * project root, then probes the filesystem to decide its final
 * {@link ProjectImportStatus}.
 */
async function finaliseImport(
  edge: RawImport,
  fileRel: string,
  root: string,
): Promise<ProjectImport> {
  const external: ProjectImport = {
    specifier: edge.specifier,
    isTypeOnly: edge.isTypeOnly,
    resolved: null,
    status: 'external',
  }

  if (!edge.specifier.startsWith('./') && !edge.specifier.startsWith('../')) {
    return external
  }

  const fileAbs = path.join(root, fileRel)
  const resolvedAbs = path.resolve(path.dirname(fileAbs), edge.specifier)
  if (!isInsideRoot(root, resolvedAbs)) {
    return external
  }

  const resolvedRel = normaliseRelative(path.relative(root, resolvedAbs))
  let exists = false
  try {
    await fs.access(resolvedAbs)
    exists = true
  } catch {
    exists = false
  }
  return {
    specifier: edge.specifier,
    isTypeOnly: edge.isTypeOnly,
    resolved: exists ? resolvedRel : null,
    status: exists ? 'ok' : 'missing',
  }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function normaliseRelative(input: string): string {
  const trimmed = input.replace(/^\.\//, '')
  return trimmed.split(path.sep).join('/')
}

function isInsideRoot(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}
