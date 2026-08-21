# Header Links

[Implementation outline](https://github.com/TiagoJacinto/runtime-visualizer/blob/feat/live-workspace-acceptance/.rpi/problems/frontend-backend-integration/06-structure-outline-live-backend-workspace.md) | Depends on [PR #35](https://github.com/TiagoJacinto/runtime-visualizer/pull/35)

## What problems was I solving

The active browser acceptance suite still described the obsolete form-oriented UI instead of the connected workspace.

## What user-facing changes did I ship

- Browser journeys inspect and run a saved Procedure.
- Diagnostics retain source and disable Run.
- A selected-file update queues during execution and applies after completion.

## How I implemented it

- `features/live-workspace.feature` defines the three supported live journeys.
- `live-workspace.hve2e.ts` binds those journeys through the Vite-to-Fastify seam.
- Playwright excludes the tagged legacy UI suite.
- Documentation moves to `.rpi/problems/frontend-backend-integration/` and records full slice completion.

## Deviations from the plan

### Implemented as planned

This completes Phase 5 and the full live-workspace vertical slice stack.

### Deviations/surprises

The Procedure-selection integration test uses a 30-second timeout because CFG and worker startup can exceed Vitest’s default under the full suite.

### Additions not in plan

Coverage limitations are documented without lowering the repository threshold.

### Items planned but not implemented

Global coverage remains below 58%: worker-thread and browser/UI paths are not fully counted by the current coverage setup.

## How to verify it

### Automated Tests

```bash
git checkout feat/live-workspace-acceptance
bun run test
bun run frontend:test:hve2e
```

### Manual Testing

With `bun run dev`, complete the three live-workspace journeys and confirm no sample workspace data appears.

## Description for the changelog

Replace browser acceptance tests with live workspace journeys.
