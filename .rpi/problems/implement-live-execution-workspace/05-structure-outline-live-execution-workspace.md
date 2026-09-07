# Live Execution Workspace

Replace the disconnected local mock and the minimal backend-connected page with one graph-first live Workspace. The implementation proceeds as vertical slices: first establish durable, stable revision identity and server-owned execution state; then expose those capabilities through browser state and transport seams; then add synchronized graph/source interaction and the production control-room shell; finally prove the complete operator flows end to end. Each phase leaves a runnable, testable Workspace capability rather than an isolated layer.

## Desired End State

- Operators select a file, Procedure ID, and durable analysis revision, inspect source/diagnostics/CFG, and run the exact selected snapshot.
- Source changes create durable revision history and newer-revision badges without changing the displayed revision implicitly.
- Active executions are server-owned, workspace-wide, independently observable, cancellable, and pinned to their starting revision across scope changes and browser reloads.
- Graph and source panes share one focus target, show individually labelled live markers, and preserve layout while loading or recovering from refresh errors.
- The approved dark control-room layout uses persistent `Scope`/`Runs` context tabs, responsive graph/source panes, and accessible status/error notifications.

## Implementation Overview

- [x] Phase 1: Persist and retrieve immutable Procedure revisions
- [x] Phase 2: Build revisions and publish replayable workspace events
- [x] Phase 3: Move execution lifecycle behind the server-owned manager
- [x] Phase 4: Drive browser scope, revisions, and runs through one reducer
- [x] Phase 5: Synchronize graph and source interaction
- [x] Phase 6: Ship the graph-first control-room Workspace
- [x] Phase 7: Prove complete durable live-workspace behavior and remove obsolete paths

---

## ✅ Phase 1: Persist and retrieve immutable Procedure revisions

Establish the backend authority for stable Procedure identities and historical snapshots. A current analysis request saves a complete dependency-context snapshot; a revision request lists summaries or loads the exact immutable snapshot. Execution can acquire a persisted snapshot after source changes or restart, without exposing SQLite details to routes.

### File Changes

- **`packages/contracts/src/revisions.ts`**, **`packages/contracts/src/analysis.ts`**, **`packages/contracts/src/execution.ts`**, **`packages/contracts/src/index.ts`**: Add `ProcedureScope`, `RevisionKey`, `RevisionSummary`, snapshot/history responses, and ID-based analysis/execution contracts; remove obsolete name-based request shapes.
- **`backend/src/modules/analysis/revisionHistory.ts`**: Define `RevisionHistory`, `AnalysisSnapshot`, and lease interfaces used by analysis and execution.
- **`backend/src/modules/analysis/infra/sqliteRevisionHistory.ts`**: Create the repository-local SQLite schema, WAL setup, validated JSON serialization, idempotent save, newest-first listing, leases, and 30-day/newest-20 retention that never prunes leased rows.
- **`backend/src/modules/analysis/infra/inMemoryRevisionHistory.ts`**: Implement the same seam as a deterministic test double.
- **`backend/src/modules/analysis/useCases/analyseSavedProcedure/analyse-saved-procedure.ts`**, **`backend/src/modules/analysis/http.ts`**: Save complete snapshots and support current versus exact historical analysis and revision-summary routes.
- **`backend/src/shared/infra/http/app.ts`**, **`.gitignore`**: Own the repository-local database lifetime and inject history into analysis; close it with the app and ignore `.runtime-visualizer/`.
- **`backend/tests/typical/integration/revision-history.integration.ts`**, **`backend/tests/typical/integration/analysis.incoming-adapter.integration.ts`**: Cover reopen persistence, stable Procedure IDs, exact historical loads, diagnostics, idempotent saves, retention, and leased revisions.

### Validation

#### Automated Verification

- [x] `bun run backend:typecheck`
- [x] `bun run backend:test:integration -- revision-history analysis.incoming-adapter`
- [x] `bun run lint`

#### Manual Verification

- [ ] Start the backend with a temporary files workspace, analyze a Procedure, restart it, and confirm the same revision remains selectable and runnable even after the source file is removed.

## ✅ Phase 2: Build revisions and publish replayable workspace events

Connect source changes and startup indexing to durable history without delaying file-event delivery. A single prioritized worker path handles interactive analysis, debounced affected-root rebuilds, retries infrastructure failures, and emits `revision-ready` only after persistence. The event hub hydrates active clients and replays retained events or requests resynchronization.

### File Changes

- **`backend/src/modules/analysis/useCases/buildRevisionHistory/buildAffectedRevisions.ts`**, **`createRevisionBuildQueue.ts`**: Build one dependency map per coalesced batch, discover every affected Procedure, enqueue startup/change work, retry twice, and publish build failures.
- **`backend/src/modules/analysis/infra/revisionBuilderWorker.ts`**, **`revisionBuilderWorkerClient.ts`**: Run analysis in one replaceable worker thread and return serializable snapshots.
- **`backend/src/modules/analysis/useCases/savedAnalysisScheduler.ts`**: Prioritize interactive requests over change and baseline work, deduplicate equivalent scopes, and persist foreground results through the same path.
- **`backend/src/modules/source/useCases/observeChanges/`**: Feed additions, modifications, and deletions to the revision queue while retaining immediate SSE notifications.
- **`backend/src/modules/workspace/`**: Add `WorkspaceEventHub`, monotonic event IDs, bounded replay, Last-Event-ID handling, hydration, and `resync-required` publication.
- **`packages/contracts/src/workspace-events.ts`**, **`packages/contracts/src/file-events.ts`**, **`packages/contracts/src/index.ts`**: Replace split source/event payloads with the validated workspace-event union.
- **`backend/src/shared/infra/http/app.ts`**, **`backend/src/modules/analysis/http.ts`**, **`backend/src/modules/source/http.ts`**: Wire queue, worker, hub, startup baseline, revision routes, and ordered shutdown.
- **`backend/tests/typical/integration/revision-build-queue.integration.ts`**, **`backend/tests/typical/integration/workspace-events.integration.ts`**, **`backend/tests/acceptance/unit/observe-procedure-changes.hvut.ts`**: Verify affected dependency rebuilds, prioritization, retries, event ordering/replay/resync, and source-change compatibility.

### Validation

#### Automated Verification

- [x] `bun run backend:test:integration -- revision-build-queue workspace-events source-change`
- [x] `bun run backend:test:acceptance`
- [x] `bun run backend:typecheck && bun run lint`

#### Manual Verification

- [ ] Modify a dependency during development and confirm the source event arrives immediately while the revision badge appears only after the persisted revision can be loaded.

## ✅ Phase 3: Move execution lifecycle behind the server-owned manager

Make execution independent of any browser connection. `ExecutionManager` acquires exact history leases, assigns display numbers, owns worker timeout/cancellation/cleanup, publishes ordered updates through the event hub, removes terminal runs from Active Runs, and exposes list/start/cancel HTTP operations. Backend restarts fail in-process runs while preserving revision history.

### File Changes

- **`backend/src/modules/execution/useCases/executionManager.ts`** and **`backend/src/modules/execution/infra/activeRunRegistry.ts`**: Encapsulate worker lifecycle, per-run ordering, current-node state, display numbers, cancellation, terminal cleanup, and lease release.
- **`backend/src/modules/execution/useCases/executeProcedure/runner.ts`**, **`execution-worker.ts`**: Adapt worker outcomes to manager updates and configurable timeout/cancel semantics.
- **`backend/src/modules/execution/http.ts`**: Change execute to `202 { executionId }`; add active-list and DELETE cancellation endpoints; remove direct browser-owned NDJSON progress coordination.
- **`backend/src/shared/infra/http/app.ts`**, **`backend/src/modules/workspace/`**: Inject one manager and publish active hydration and execution updates over the shared event hub.
- **`backend/src/modules/execution/infra/revision-store.ts`**, **`backend/src/modules/execution/index.ts`**: Delete the obsolete private revision authority and expose the manager seam instead.
- **`backend/tests/typical/integration/execution-manager.integration.ts`**, **`backend/tests/typical/integration/execution.incoming-adapter.integration.ts`**, **`backend/tests/typical/integration/run-procedure-revision.integration.ts`**: Cover concurrent runs, stable numbers, ordered progress, timeout, cancellation, unknown IDs, exact revision pinning, and lease cleanup on every terminal path.
- **`ROBUSTNESS.md`**: Record that active workers fail on backend restart and are not resumed.

### Validation

#### Automated Verification

- [x] `bun run backend:test:unit -- execution-manager`
- [x] `bun run backend:test:integration -- execution-manager execution.incoming-adapter run-procedure-revision`
- [x] `bun run backend:typecheck && bun run lint`

#### Manual Verification

- [ ] Start two long-running executions, reload or disconnect the browser, and confirm both continue server-side and can be listed and cancelled afterward.

## ✅ Phase 4: Drive browser scope, revisions, and runs through one reducer

Replace name-based, origin-owned browser coordination with a normalized reducer/controller that consumes revision history and the shared workspace event stream. Restore and persist the last valid scope, deterministically fall back when unavailable, retain active runs across scope changes, defer only explicit focus loads, and roll cancellation back on transport failure.

### File Changes

- **`browser/src/shared/api/analysisGateway.ts`**, **`executionGateway.ts`**, **`workspaceEventsGateway.ts`**, **`workspacePreferences.ts`**: Add revision list/load, 202 start/list/cancel, replay-aware SSE decoding, and validated local-storage adapters.
- **`browser/src/pages/liveWorkspace/useCases/liveWorkspace.types.ts`**: Normalize selected `RevisionKey`, summaries, pane state, active runs, connection cursor, focus, context tab, cancellation, and notifications.
- **`browser/src/pages/liveWorkspace/useCases/liveWorkspace.reducer.ts`**, **`liveWorkspace.effects.ts`**, **`createLiveWorkspaceController.ts`**, **`liveWorkspace.ports.ts`**: Implement typed intents/events/effects, stale-load suppression, scope fallback, badge-only revision updates, run hydration, View, cancel safeguard, retry, and disposal.
- **`browser/tests/acceptance/unit/live-workspace.hvut.ts`**, **`browser/tests/acceptance/unit/analysis-gateway.hvut.ts`**, plus reducer/adapter tests: Assert transitions and effect descriptions for restored/unavailable scopes, revision selection, concurrent updates, disconnect/replay, cancellation rollback, and terminal notifications.

### Validation

#### Automated Verification

- [x] `bun run frontend:test:hvut`
- [x] `bun run frontend:lint`
- [x] `bun run --filter runtime-visualizer-browser build`

#### Manual Verification

- [ ] Open two browser tabs, start a run in one, reload the other, and confirm both show the active run while selecting a different revision does not change the run’s pinned scope.

## ✅ Phase 5: Synchronize graph and source interaction

Implement the shared visual model for the selected immutable snapshot. Graph imports are a projection, ELK/React Flow layout is keyed by revision and import visibility, execution markers update without moving nodes, and source executable ranges resolve to the same neutral focus target as graph selection. Diagnostics and failed-run navigation target the pinned revision and source location.

### File Changes

- **`browser/package.json`**: Add `@xyflow/react` and `elkjs`.
- **`browser/src/pages/liveWorkspace/components/controlFlowGraph/GraphPane.tsx`**, **`ControlFlowNode.tsx`**, **`controlFlowLayout.ts`**, **`selectVisibleGraph.ts`**: Render positioned CFG nodes/edges, import projection, accessible keyboard selection, Fit graph, and individually labelled markers.
- **`browser/src/pages/liveWorkspace/components/source/SourcePane.tsx`**, **`sourceRangeIndex.ts`**: Render escaped numbered source with executable range selection and neutral focus styling.
- **`browser/src/pages/liveWorkspace/useCases/`**: Add `FocusTarget`, source-position resolution, failure-focus intents, and selectors for visible markers/revision badges.
- **`browser/tests/acceptance/unit/graph-source-sync.hvut.ts`**, component tests: Cover import filtering, stable layout on progress, one-node focus synchronization, non-executable source, marker accessibility, and diagnostic/failure focus.

### Validation

#### Automated Verification

- [x] `bun run frontend:test:hvut -- graph-source-sync`
- [x] `bun run frontend:test:typical`
- [x] `bun run --filter runtime-visualizer-browser build && bun run frontend:lint`

#### Manual Verification

- [ ] Select a graph node and source statement at desktop width; confirm both panes show the same neutral focus while a separate numbered run marker remains visibly live.

## ✅ Phase 6: Ship the graph-first control-room Workspace

Compose the production shell from live state and intents, porting the approved mock’s visual language without retaining its local data. Add the persistent `Scope`/`Runs` context rail, newest-first independently scrolling active-run list, inline cancel confirmation, graph-first pane proportions, loading/error masks, diagnostics, notifications, responsive off-canvas behavior, and accessible labels. Delete the generated mock only after the production route has parity.

### File Changes

- **`browser/src/pages/liveWorkspace/liveWorkspace.page.tsx`**: Become the composition root for the header, context rail, procedure workspace, notifications, and pane-local loading/error states.
- **`browser/src/pages/liveWorkspace/components/workspaceHeader/WorkspaceHeader.tsx`**, **`contextRail/ContextRail.tsx`**, **`ScopeNavigation.tsx`**, **`ActiveRuns.tsx`**, **`procedureWorkspace/ProcedureWorkspace.tsx`**, **`notifications/WorkspaceNotifications.tsx`**: Implement the approved structure and typed intent wiring.
- **`browser/src/index.css`**, **`browser/src/main.tsx`**: Activate the documented green-black tokens, typography, focus treatment, and responsive behavior without forced light-mode assumptions.
- **`browser/src/components/generated/LiveProcedureWorkspace.tsx`**, obsolete prototype entry paths, and unused imports: Delete after parity; keep the placement ledger as the design decision record.
- **`features/live-workspace.feature`**, **`browser/tests/acceptance/e2e/live-workspace.hve2e.ts`**: Extend scenarios for revision history, badges, context tabs, View/cancel, loading/error recovery, diagnostics, and terminal notifications.

### Validation

#### Automated Verification

- [x] `bun run frontend:test:hve2e`
- [x] `bun run frontend:build && bun run frontend:lint`
- [x] `bun run lint`

#### Manual Verification

- [ ] At wide, medium, and narrow viewport widths, confirm the rail remains usable, graph retains priority, source stacks without clipping, and 30 active runs scroll inside the rail.

## ✅ Phase 7: Prove complete durable live-workspace behavior and remove obsolete paths

Exercise the full browser-to-backend contract against real SQLite, workers, SSE replay, source mutations, diagnostics, deletion, cancellation, and concurrent runs. Close remaining lifecycle and accessibility gaps, then run the repository gates so the old API/event assumptions cannot remain hidden behind passing unit tests.

### File Changes

- **`features/live-workspace.feature`** and **`features/`**: Add domain scenarios for historical execution after deletion, explicit revision choice, cross-browser active runs, cancellation, reconnect/resync, diagnostics, and all terminal outcomes.
- **`browser/tests/acceptance/e2e/live-workspace.hve2e.ts`**, **`backend/tests/typical/integration/`**: Add fixtures and bindings for restart persistence, source/dependency changes, delayed analysis, event replay, and worker failure.
- **`browser/playwright.config.ts`**, test-server wiring, and temporary database helpers: Ensure acceptance runs use isolated source/database paths and deterministic clocks/timeouts.
- **`README.md`**, endpoint documentation, and package exports: Document the durable history location and current API; remove references to deleted NDJSON/name-based paths.

### Validation

#### Automated Verification

- [x] `bun run test`
- [x] `bun run cibuild`
- [x] `bun run clone-check`

#### Manual Verification

- [ ] Perform one operator walkthrough: select an old revision, inspect source and graph, run it while changing source, switch to another Procedure, View the run, cancel a second run, reload, and confirm no implicit revision replacement occurs.

## Open Questions

None.
