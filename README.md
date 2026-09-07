# Runtime Visualizer

Runtime Visualizer is a graph-first workspace for inspecting and running saved TypeScript Procedures.

## Development

```bash
bun install
bunx playwright install chromium # once; required for browser acceptance tests
bun run dev                 # frontend (:5173) + backend (:3000)
```

Run either side independently with `bun run frontend:dev` or `bun run backend:dev`.

The backend observes the source workspace configured by `settings.json` (`filesFolder`, defaulting to `./target`). Durable analysis snapshots are stored in `.runtime-visualizer/revisions.sqlite` at the repository root. The directory is local state and is ignored by git. Set `databasePath` when constructing `createApp` to use an isolated database in tests or tooling.

## Workspace API

All Procedure and execution selections use the stable discovered `procedureId` and an immutable analysis `revision`.

- `GET /api/files` — list supported saved source files.
- `GET /api/analysis?file=<path>&procedureId=<id>` — analyze and persist the current snapshot.
- `GET /api/analysis/revisions?file=<path>&procedureId=<id>` — list retained revision summaries, newest first.
- `GET /api/analysis?file=<path>&procedureId=<id>&revision=<hash>` — load an exact historical snapshot.
- `POST /api/execute` — start `{ file, procedureId, revision }`; returns `202 { executionId }`.
- `GET /api/execute` — list workspace-wide active executions.
- `DELETE /api/execute/<executionId>` — request cancellation; returns `202` or `404`.
- `GET /api/events` — replay-aware SSE for source changes, revision readiness, active executions, execution updates, and resynchronization.
- `GET /api/health` — liveness probe.

Historical snapshots remain available after source changes or deletion, subject to the 30-day/newest-20 retention policy and active execution leases. Execution progress is server-owned and is not tied to a browser connection.

## Validation

```bash
bun run test
bun run cibuild              # authoritative local CI-equivalent quality gate
bun run clone-check
```

### Dynamic coverage policy

All quality-policy numbers live in JSON and are validated with Zod before the gate runs:

- `quality/policy.json` defines rating bounds, repository thresholds, changed-code floor/ceiling, default importance, and branch targets.
- `quality/procedure-inputs.json` defines numeric importance and criticality values from the configured rating range:
  - `default.importance` applies when no file or Procedure override exists.
  - `files` overrides a whole production file.
  - `procedures` overrides a function using `path#functionName`.

Changed-code requirements are calculated from configured importance and static branch count. CI prints the calculated requirement and evidence when a changed Procedure fails.
