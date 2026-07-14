/**
 * playground.ts — internal playground for the project-aware CFG walker.
 *
 * The user picks a file in ./target; we walk the local `.ts` import
 * graph from that entry, build CFGs only for the visited subgraph,
 * and print a summary to the terminal.
 *
 * Run it (from the repo root):
 *
 *   bun playground.ts                       # default: self-check.ts
 *   bun playground.ts scripts/text-report.ts
 *   bun playground.ts arithmetic.ts --json  # raw ProjectCfg JSON
 *
 * Try files that DO and DON'T exist to see partial graphs in action.
 */

import * as path from 'node:path'
import { buildProjectCfg, type ProjectCfg } from './server/src/cfg/project.ts'

type Args = { entry: string; json: boolean }

function parseArgs(argv: ReadonlyArray<string>): Args {
  const positional: string[] = []
  let json = false
  for (const arg of argv) {
    if (arg === '--json') json = true
    else positional.push(arg)
  }
  return { entry: positional[0] ?? 'self-check.ts', json }
}

function summarise(project: ProjectCfg): string {
  const lines: string[] = []
  lines.push(`entry:  ${project.entry}`)
  lines.push(`root:   ${project.root}`)
  lines.push(`files:  ${project.files.length}`)
  for (const file of project.files) {
    const fnCount = file.cfg.functions.length
    const external = file.imports.filter((i) => i.status === 'external').length
    const missing = file.imports.filter((i) => i.status === 'missing').length
    lines.push(
      `  - ${file.path}  (${fnCount} fn${fnCount === 1 ? '' : 's'}, ` +
        `${external} external, ${missing} missing)`,
    )
  }
  lines.push(`graph:`)
  for (const [from, tos] of Object.entries(project.graph)) {
    if (tos.length === 0) continue
    lines.push(`  ${from} → ${tos.join(', ')}`)
  }
  return lines.join('\n')
}

const { entry, json } = parseArgs(process.argv.slice(2))
const root = path.resolve(process.cwd(), 'target')

try {
  const project = await buildProjectCfg(entry, { root })
  if (json) {
    console.log(JSON.stringify(project, null, 2))
  } else {
    console.log(summarise(project))
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`❌ ${message}`)
  process.exit(1)
}