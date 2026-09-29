---
type: structure-outline
---

# Browser-Managed Source Files

Replace the backend-owned file and workspace pipeline with browser-owned project access, analysis, revision history, and execution. Deliver this as vertical slices through the browser UI, workspace controller, browser-local modules/adapters, and tests; remove the backend and shared contracts workspace only after equivalent browser behavior is covered.

## Desired End State

- Users select and switch between saved project folders; directory handles persist in IndexedDB and unavailable permission prompts folder reselection.
- The workspace displays a nested tree containing `.ts`/`.tsx` files, with useful welcome, unsupported-browser, and no-source-file states.
- Local analysis and project-scoped immutable revision history preserve file/procedure/revision selection and source/CFG display.
- External file changes are detected while a project is open and refresh the tree and affected analysis/history.
- Execution and cancellation run the selected immutable revision in browser workers.
- The browser is the sole application workspace; backend, `packages/`, HTTP-only contracts, and their scripts/imports/tests are removed.

## Implementation Overview

- [x] Phase 1: Open and analyze saved browser projects
- [ ] Phase 2: Refresh analysis from external project changes
- [ ] Phase 3: Execute and cancel selected local revisions
- [ ] Phase 4: Remove backend and shared-contract workspaces

---

## ✅ Phase 1: Open and analyze saved browser projects

Establish the browser-local project and analysis path end-to-end. Add a project using the directory picker, persist its handle and internal ID, read supported files, analyze them off the UI thread, persist project-scoped snapshots, and render/select the resulting project tree and revision in the existing workspace. Restore saved projects on startup; when permission is unavailable, retain the project and prompt the user to reselect its folder. Add the dedicated first-project welcome, picker-unsupported guidance, and empty-source-project state. Use `@pierre/trees` behind a workspace-owned `ProjectFileTree` wrapper, after pinning and verifying the selected beta version.

### File Changes

- **`browser/src/modules/project-files/` (new)**: Public project-files and projects ports plus private File System Access API adapters for picker, handle identity via `isSameEntry()`, recursive supported-source traversal, reads, and IndexedDB saved-handle storage.
- **`browser/src/modules/analysis/` (new)**: `AnalyzeProject`, browser analysis worker/client, browser-owned analysis/revision types, and analysis coordination using the project-files and history interfaces. Move/rework the existing CFG and analysis behavior here; keep module callers on focused public entry points.
- **`browser/src/modules/revision-history/` (new)**: `RevisionHistory` and IndexedDB implementation; atomically save project-scoped snapshots while content-addressing source text, and load complete immutable snapshots.
- **`browser/src/pages/liveWorkspace/useCases/live-workspace.ports.ts`, `live-workspace.controller.ts`, `live-workspace.query.ts`, and `live-workspace.types.ts`**: Inject the projects port and local analysis module; add project IDs to revision keys, snapshots, and every relevant query key; initialize and switch projects without allowing same-path cache collisions.
- **`browser/src/pages/liveWorkspace/live-workspace.page.tsx` and `components/`**: Wire browser adapters at the composition root; implement welcome/unsupported/permission-reselection/empty-source states, project switcher, and `ProjectFileTree` wrapper around `@pierre/trees`; retain existing source and CFG panes.
- **`browser/package.json`, `browser/bun.lock`**: Add and lock the verified tree dependency.
- **`browser/tests/typical/unit/`**: Add public-interface unit tests for project selection, handle identity/restore outcomes, source filtering and traversal, project-scoped query keys, and history save/load/deduplication.
- **`browser/tests/typical/integration/`**: Add IndexedDB adapter integration coverage for project-scoped snapshots, source deduplication, and schema upgrades.

### Validation

#### Automated Verification

- [x] `bun run frontend:test:unit`
- [x] `bun run frontend:test:integration`
- [x] `bun run frontend:test:hvut && bun run frontend:test:hvit`
- [x] `bun run frontend:build`

#### Manual Verification

- [x] In Chromium over a secure origin, use the real directory picker once to confirm a selected folder opens.

## ✅ Phase 2: Refresh analysis from external project changes

Replace the server watcher/SSE path with a project-scoped browser poller. Take an initial baseline, then poll every 250 ms using `File.size` and `File.lastModified` to avoid rereading unchanged files; read changed files to compute content revisions, report additions/modifications/deletions, and rebuild affected dependency-aware analysis snapshots. Update the tree and workspace selection safely when the selected file is changed or deleted.

### File Changes

- **`browser/src/modules/project-files/`**: Add cancellable polling/change detection and typed local change events; stop polling when the project is closed or the workspace is disposed.
- **`browser/src/modules/analysis/`**: Reanalyze changed files and dependent procedures from the current project source map and save new immutable snapshots through `RevisionHistory`.
- **`browser/src/pages/liveWorkspace/useCases/live-workspace.ports.ts`, `live-workspace.controller.ts`, and `live-workspace.query.ts`**: Replace remote event subscription/invalidation with local change subscription and project-scoped updates; preserve revision history and active-selection behavior.
- **`browser/src/pages/liveWorkspace/components/`**: Reflect added/deleted paths and refreshed source/analysis; retain an explanatory empty state if the source tree becomes empty.
- **`browser/tests/typical/unit/`**: Test metadata short-circuiting, content revision detection, add/modify/delete events, overlapping poll prevention, and controller/query refresh behavior.
- **`browser/tests/typical/integration/` and `browser/tests/acceptance/`**: Test the real filesystem adapter boundary where supported and bind acceptance examples for external add/edit/delete causing tree, source, and dependent analysis/history updates.

### Validation

#### Automated Verification

- [x] `bun run frontend:test:unit`
- [x] `bun run frontend:test:integration`
- [x] `bun run frontend:test:hvut && bun run frontend:test:hvit`
- [x] `bun run frontend:build`

## ✅ Phase 3: Execute and cancel selected local revisions

Preserve the current run, progress, failure-focus, and cancellation workflows without server endpoints. Execution requests load the exact project-scoped immutable snapshot from IndexedDB and run it in a dedicated Web Worker; stream node updates to workspace state, and terminate the worker on cancellation. This phase completes execution against the same snapshot shown by revision selection, even if current files have changed.

### File Changes

- **`browser/src/modules/execution/` (new)**: Local execution port, worker/client protocol, execution models, selected-revision snapshot loading, node-event streaming, and cancellation/worker lifecycle.
- **`browser/src/modules/revision-history/`**: Expose the snapshot acquisition/load operation required by execution while keeping persistence details private.
- **`browser/src/pages/liveWorkspace/useCases/live-workspace.ports.ts`, `live-workspace.controller.ts`, and `live-workspace.query.ts`**: Wire local execution, project-scoped execution identity, event updates, cancellation, and completed execution state without HTTP/event-stream assumptions.
- **`browser/src/pages/liveWorkspace/components/`**: Keep run controls, progress, execution history, errors, and failure-node focus connected to local execution updates.
- **`browser/tests/typical/unit/`**: Test worker client protocol, unavailable snapshots, cancellation/termination, and controller execution state transitions.
- **`browser/tests/typical/integration/` and `browser/tests/acceptance/`**: Verify worker execution consumes the selected saved revision and streams completion/failure/cancellation through the workspace.

### Validation

#### Automated Verification

- [x] `bun run frontend:test:unit`
- [x] `bun run frontend:test:integration`
- [x] `bun run frontend:test:hvut && bun run frontend:test:hvit`
- [x] `bun run frontend:build`

## ✅ Phase 4: Remove backend and shared-contract workspaces

With local file access, analysis/history, change refresh, and revision-pinned execution covered, delete the backend and `packages/` workspace and remove obsolete HTTP schemas, adapters, server configuration, and cross-workspace references. Move remaining browser-used contracts into their owning browser modules' public entry points. Make root scripts, quality gates, test discovery, and documentation consistently browser-only, and refresh the lockfile.

### File Changes

- **`backend/` and `packages/`**: Delete the backend application/modules/tests and shared contracts package; migrate only still-needed analysis, CFG, execution, revision, and UI event types/behavior into the browser-owned modules before removal.
- **`browser/src/shared/api/analysis-gateway.ts`, `execution-gateway.ts`, `workspace-events-gateway.ts`, `live-workspace.event-stream.ts`, and `browser/src/shared/api/` HTTP-only schemas**: Delete remote adapters and HTTP-only request/response contracts after all consumers/tests are migrated.
- **`browser/src/pages/liveWorkspace/useCases/` and `browser/src/shared/`**: Remove server connection, SSE cursor, and backend-error state that no longer describes local operation; retain local preferences only where still used.
- **`browser/package.json`, root `package.json`, `bun.lock`, `browser/vitest.config.ts`, `.github/workflows/`, `quality/`, and repository scripts/docs**: Remove backend/contracts workspace, scripts, task references, obsolete browser HVE2E configuration, test projects, and CI gates; keep browser unit/integration/acceptance gates. Update clone/lint/build/coverage scopes to the remaining source tree.
- **`browser/tests/` and `features/`**: Remove backend-only API/contracts tests and obsolete scenarios; retain and update browser acceptance scenarios for all promised project, analysis, history, change, and execution behavior.

### Validation

#### Automated Verification

- [x] `bun install --frozen-lockfile`
- [x] `bun run lint`
- [x] `bun run frontend:test:unit && bun run frontend:test:integration && bun run frontend:test:acceptance`
- [x] `bun run frontend:build`
- [x] `bun run quality:static && bun run quality:acceptance && bun run quality:regression`
- [x] Search remaining tracked application/configuration files for backend, `@runtime-visualizer/contracts`, and obsolete HTTP adapter references; each search must show no unintended references.

## Open Questions

None; key decisions are recorded in the TDD artifact. Validate the beta tree library API/accessibility and the documented risks around browser permission persistence, worker resource limits, metadata-based change detection, and IndexedDB quota while implementing the relevant phase.
