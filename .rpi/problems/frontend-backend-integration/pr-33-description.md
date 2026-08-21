# Header Links

[Implementation outline](https://github.com/TiagoJacinto/runtime-visualizer/blob/feat/live-workspace-acceptance/.rpi/problems/frontend-backend-integration/06-structure-outline-live-backend-workspace.md) | Depends on [PR #32](https://github.com/TiagoJacinto/runtime-visualizer/pull/32)

## What problems was I solving

The browser still rendered fixed demonstration data instead of backend-owned files, source, diagnostics, revisions, and graphs.

## What user-facing changes did I ship

- The application loads and selects live saved files and Procedures.
- Source, diagnostics, revisions, and generic CFG nodes render from the analysis API.
- Loading, empty, retry, diagnostics, and backend-unavailable states are explicit.

## How I implemented it

- `browser/src/App.tsx` mounts the live workspace.
- `analysisGateway.ts` validates transport data with shared contracts.
- `createLiveWorkspaceController.ts` owns selection, cancellation, stale-response protection, and retry.
- The page and CFG components render backend data without a graph library or sample fallback.

## Deviations from the plan

### Implemented as planned

This delivers Phase 2 on top of the saved-analysis API.

### Deviations/surprises

The shared contracts and workspace settings are included because the browser needs them before it can consume the API.

### Additions not in plan

None.

### Items planned but not implemented

Execution observation, revision pinning, and the final browser contract are in later stacked PRs.

## How to verify it

### Automated Tests

```bash
git checkout feat/live-workspace-display
bun run frontend:build
bun run frontend:test:hvut
```

### Manual Testing

Start `bun run dev`, select two saved files and Procedures, and confirm source, revision, and CFG change together.

## Description for the changelog

Display saved backend analysis in the live workspace.
