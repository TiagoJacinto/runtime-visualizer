# Implementation Structure Outline: Live Backend Workspace

## Implementation Overview

- [x] Phase 1: Deliver a revision-consistent saved-Procedure API
- [ ] Phase 2: Display live files, source, diagnostics, and graphs (HVE2E bindings pending Phase 5 rewrite)
- [ ] Phase 3: Run and observe revision-bound Executions
- [ ] Phase 4: Keep live work stable through file changes and reconnects
- [ ] Phase 5: Replace the obsolete browser acceptance contract

## ✅ Phase 1: Deliver a revision-consistent saved-Procedure API

### Overview

Create the typed saved-project analysis boundary that gives the browser one source, Procedure list, diagnostic result, Control-flow graph, and executable revision from the same snapshot. Add server-owned Execution identity without changing the ordered NDJSON body.

### File changes

- Update root `package.json` and lockfile to include `packages/contracts` in the Bun workspace.
- Add `packages/contracts/package.json` and `packages/contracts/src/{analysis,execution,file-events,index}.ts`. Define Zod schemas and inferred types for analysis success, analysis diagnostics, execution header/events, and source-change records.
- Add `backend/src/modules/analysis/{http.ts,index.ts,useCases/analyseSavedProcedure/analyse-saved-procedure.ts}`. Compose existing source reading, Procedure discovery, project analysis, and `RevisionStore` storage into one saved-Procedure snapshot use case.
- Update `backend/src/shared/infra/http/app.ts` to construct and register the analysis route with the existing `RevisionStore` and source folder.
- Update `backend/src/modules/execution/useCases/executeProcedure/execute.ts` to allocate an Execution ID before stream start and return it in `X-Execution-Id`; keep node and terminal NDJSON records in wire order.
- Update module exports in `backend/src/modules/{source,cfg,execution}/index.ts` only where the analysis use case needs public domain operations. Do not move filesystem, CFG, or revision-store ownership into the new module.

### Test changes

- Add `backend/tests/typical/integration/analysis.incoming-adapter.integration.ts` for successful revision-consistent snapshots and 422 diagnostics that retain source and Procedures but omit a graph.
- Add `backend/tests/typical/integration/execution.incoming-adapter.integration.ts` for `X-Execution-Id`, ordered NDJSON events, one terminal result, and pre-stream errors.

### Validation

#### Automated Verification

```bash
bun run backend:typecheck         # [x]
bun run backend:test:integration  # [x]
bun run lint                      # [x]
```

#### Manual Verification

- Request `GET /api/analysis` for a saved TypeScript file and confirm its response contains matching source, revision, Procedures, and CFG.

## Phase 2: Display live files, source, diagnostics, and graphs

### Overview

Replace the fixed workspace data with the smallest usable live Operator flow: startup selects the first backend-owned file and Top level Procedure, shows a live source and Control-flow graph, supports selection, and presents valid diagnostics or transport failure without a demonstration fallback.

### File changes

- Add `browser/src/pages/liveWorkspace/useCases/{liveWorkspace.types.ts,liveWorkspace.ports.ts,liveWorkspace.state.ts,createLiveWorkspaceController.ts,useWorkspaceController.ts}`. The framework-independent controller owns selection, latest-request protection, cancellation, immutable state publication, and Retry.
- Add `browser/src/shared/api/{analysisGateway.ts,fileEventsGateway.ts}`. Parse every HTTP and SSE value with `@runtime-visualizer/contracts`; expose only feature-owned gateway ports to the controller.
- Add `browser/src/pages/liveWorkspace/{liveWorkspace.page.tsx,components/navigation,components/sourcePanel,components/controlFlowGraph,components/diagnostics,components/workspaceHeader}`. Render generic CFG nodes and edges with the existing React/CSS approach, not a graph library.
- Update `browser/src/App.tsx` to mount `LiveWorkspacePage` and remove the generated workspace from the production tree. Remove `browser/src/components/generated/LiveProcedureWorkspace.tsx` once no production or test import remains.
- Preserve the dark control-room layout, semantic controls, graph node accessibility, and disabled actions. Render loading, no-source, diagnostics, and backend-unavailable states directly.

### Test changes

- Add controller HVUT bindings and in-memory gateway spies under `browser/tests/acceptance/unit/` and shared test support under `browser/tests/support/` for initial selection, stale-response suppression, no files, diagnostics, and retry.
- Add component tests beside `browser/src/pages/liveWorkspace/components/` for generic node/edge rendering and graph diagnostics replacing only the graph.
- Extend the existing visualization and diagnostic HVE2E bindings in `browser/tests/acceptance/e2e/` to use saved backend files and the live workspace controls.

### Validation

#### Automated Verification

```bash
bun run frontend:build         # [x]
bun run frontend:test:typical  # [x]
bun run frontend:test:hvut     # [x]
bun run frontend:test:hve2e    # [x] — obsolete UI scenarios are quarantined; live HVE2E replacements remain for Phase 5
```

#### Manual Verification

- Start `bun run dev`, select two saved files and Procedures, and confirm the source, revision, and graph change together.

## Phase 3: Run and observe revision-bound Executions

### Overview

Let the Operator run the displayed revision and observe each concurrent Execution in its matching graph. Terminal outcomes stay in the session run inspector; only active markers clear.

### File changes

- Add `browser/src/shared/api/executionGateway.ts`. Start the revision-bound execution request, read `X-Execution-Id`, parse NDJSON incrementally, and surface a transport end before a terminal result as interruption.
- Extend `browser/src/pages/liveWorkspace/useCases/` with Execution records keyed by server ID, browser-session snapshot cache keys, visible-Execution selectors, execution selection, and `clearCompleted()`.
- Add `browser/src/pages/liveWorkspace/components/runInspector/` and extend `controlFlowGraph/` to show distinct numbered/color markers, selected marker emphasis, and `aria-current="step"` only for current nodes.
- Update the page composition root to construct the execution gateway and dispose active transport work when unmounted.

### Test changes

- Extend controller HVUTs for overlapping Executions, node-event routing by server ID, successful and failed terminal Results, interrupted streams, selection navigation to a pinned snapshot, and clearing completed records.
- Extend `features/observe-execution.feature` with server-neutral scenarios for overlapping Execution visibility and terminal outcomes; bind them through browser HVUT and HVE2E suites.
- Extend `browser/tests/acceptance/e2e/observe-execution.hve2e.ts` to prove live markers move through the displayed graph and clear on completion.

### Validation

#### Automated Verification

```bash
bun run frontend:build
bun run frontend:test:hvut
bun run frontend:test:hve2e
bun run backend:test:integration
```

#### Manual Verification

- Start two Executions for the same displayed Procedure and confirm both markers remain visible until their own terminal Result.

## Phase 4: Keep live work stable through file changes and reconnects

### Overview

Use one SSE subscription to update the file inventory and refresh live analysis safely. Pin a displayed revision while matching Executions run, retain only the newest queued update, and recover from lost backend connections without pretending retained content is current.

### File changes

- Extend `browser/src/pages/liveWorkspace/useCases/createLiveWorkspaceController.ts` with one abortable file-event subscription, selected-file deletion and removed-Procedure handling, matching-Execution revision pinning, and newest-only queued refresh.
- Add `browser/src/shared/retry/` with a cancellable bounded-backoff scheduler adapter. Keep timing policy in the controller through its injected port.
- Extend `browser/src/shared/api/fileEventsGateway.ts` to convert SSE into validated, abortable async iteration and distinguish normal disposal from a connection failure.
- Update live-workspace header, navigation, diagnostics, graph, and run-inspector components to show `Update queued`, `File deleted`, `Reconnecting`, and interrupted Execution outcomes while disabling only live actions that require the backend.

### Test changes

- Extend controller HVUTs for additions, unrelated changes, dependency changes, selected-file deletion, Procedure removal, newest-only queued revisions, refresh after every matching Execution terminates, disconnection interruption, bounded reconnect, and cleanup on disposal.
- Extend `features/observe-execution.feature` with revision-pinning and queued-refresh scenarios, then bind them at controller and HVE2E seams.
- Add or extend browser HVE2E support so a filesystem change can be made during an Execution and the UI verifies that source and graph do not move until it completes.

### Validation

#### Automated Verification

```bash
bun run frontend:test:hvut
bun run frontend:test:hve2e
bun run backend:test:integration
bun run lint
```

#### Manual Verification

- Edit the selected file during an active Execution and confirm `Update queued` remains until the final matching Execution reaches a terminal Result.

## Phase 5: Replace the obsolete browser acceptance contract

### Overview

Complete the migration from the form-oriented browser test contract to the connected workspace contract. Remove dead generated UI and verify all supported Operator journeys against the real Vite-to-Fastify seam.

### File changes

- Update `browser/tests/acceptance/e2e/{visualize-control-flow,show-control-flow-imports,diagnose-control-flow-graph,compose-multi-file-program,observe-execution}.hve2e.ts` so bindings use the live selectors, source panel, generic Control-flow graph, diagnostics, and run inspector.
- Remove obsolete form-specific test helpers, fixed test IDs, and any remaining imports of `browser/src/components/generated/LiveProcedureWorkspace.tsx`.
- Update `README.md` only if the live workspace introduces a required local setup step; otherwise retain the existing same-origin development command.

### Test changes

- Keep exactly the critical browser HVE2E journeys: inspect and run a saved Procedure, show analysis diagnostics while source remains visible and Run is disabled, and defer a selected-file update until matching Execution completion.
- Run the full repository suite to catch stale cross-package imports, feature bindings, and browser/backend contract drift.

### Validation

#### Automated Verification

```bash
bun run test
bun run coverage
bun run frontend:build
```

#### Manual Verification

- With `bun run dev` running, confirm no sample file, sample revision, simulated change, or locally manufactured Execution appears in the workspace.

## Risks and follow-up

- The initial dependency-free vertical CFG layout is intentionally limited. Validate real saved-project graphs before adding layout, routing, or graph-navigation features.
- Keep `POST /api/cfg` unchanged in this work. Remove that inline-source compatibility route only after a separate repository-wide consumer audit.
