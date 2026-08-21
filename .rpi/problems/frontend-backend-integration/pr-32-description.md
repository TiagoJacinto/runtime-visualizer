# Header Links

[Implementation outline](https://github.com/TiagoJacinto/runtime-visualizer/blob/feat/live-workspace-acceptance/.rpi/problems/frontend-backend-integration/06-structure-outline-live-backend-workspace.md)

## What problems was I solving

The browser needed one revision-consistent backend snapshot instead of independently assembled source, graph, and execution data.

## What user-facing changes did I ship

- `GET /api/analysis` returns saved source, Procedures, diagnostics, CFG, and an executable revision.
- Execution responses expose a server-owned `X-Execution-Id` while retaining ordered NDJSON events.

## How I implemented it

- `backend/src/modules/analysis/http.ts` registers the analysis HTTP boundary.
- `analyse-saved-procedure.ts` composes saved source, Procedure discovery, analysis, and revision storage.
- `execute.ts` allocates the execution identity before streaming.
- Integration tests cover successful snapshots, diagnostics, ordered events, and pre-stream failures.

## Deviations from the plan

### Implemented as planned

This is Phase 1 of the outline. Existing source, CFG, execution, and revision ownership stays in place.

### Deviations/surprises

None in this slice.

### Additions not in plan

None.

### Items planned but not implemented

Browser display, execution observation, revision pinning, and browser acceptance are in the following stacked PRs.

## How to verify it

### Automated Tests

```bash
git checkout feat/saved-procedure-api
bun run backend:test:integration
bun run backend:typecheck
```

### Manual Testing

Request `GET /api/analysis` for a saved TypeScript file and confirm source, Procedures, revision, and CFG describe one snapshot.

## Description for the changelog

Add a revision-consistent saved Procedure analysis API.
