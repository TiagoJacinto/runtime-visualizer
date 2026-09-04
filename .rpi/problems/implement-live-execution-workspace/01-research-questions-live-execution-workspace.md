# Research Questions: Live Execution Workspace

## Topic

Understand the current Runtime Visualizer implementation, backend contracts, acceptance coverage, and design constraints surrounding the live execution Workspace.

## Findings

- The problem is sourced from GitHub issue `https://github.com/TiagoJacinto/runtime-visualizer/issues/44` and describes Wayfinder #44 plus decisions #45–#49 (`.rpi/problems/implement-live-execution-workspace/problem.md:1-15`).
- The browser currently renders a single React workspace whose files, source, graph, runs, revisions, diagnostics, and events are local values in `browser/src/components/generated/LiveProcedureWorkspace.tsx:25-87,169-217` (`.rpi/problems/frontend-backend-integration/03-research-current-integration.md:9-15`).
- The Fastify app registers analysis, CFG, execution, file, source, and source-change event routes under `/api` (`backend/src/shared/infra/http/app.ts:71-106`).
- The live-workspace feature covers saved-Procedure inspection, diagnostic display with disabled execution, and source refresh queued during an active execution (`features/live-workspace.feature:1-23`).
- The documented visual language is a dark green-black control-room workspace using Inter, IBM Plex Mono, emerald live/action state, semantic warning/info/danger colors, hairline borders, and responsive navigation, graph, source, and run-inspector regions (`DESIGN.md:1-30,149-218`).

## Key Context Pointers

- `https://github.com/TiagoJacinto/runtime-visualizer/issues/44`
- `Wayfinder #44`
- `decisions #45–#49`
- `.rpi/problems/implement-live-execution-workspace`
- `browser/src/components/generated/LiveProcedureWorkspace.tsx`
- `browser/src/App.tsx`
- `browser/src/main.tsx`
- `browser/src/index.css`
- `backend/src/shared/infra/http/app.ts`
- `backend/src/modules/source/`
- `backend/src/modules/cfg/`
- `backend/src/modules/execution/`
- `backend/src/modules/analysis/`
- `features/live-workspace.feature`
- `browser/tests/acceptance/e2e/live-workspace.hve2e.ts`
- `DESIGN.md`
- `PRODUCT.md`
- `CONTEXT.md`

## Research Questions

1. How is the current browser Workspace structured, where is its state held, and which displayed values and interactions are fixed, local, or connected to backend data across `browser/src/App.tsx`, `browser/src/main.tsx`, and `browser/src/components/generated/LiveProcedureWorkspace.tsx`?

2. What HTTP and streaming endpoints currently expose files, source, Procedures, control-flow graphs, analysis diagnostics, executions, revisions, and source-change events, and what are their exact request, response, error, and lifecycle contracts?

3. How do the source, analysis, CFG, execution, and revision-store modules currently model saved files, Procedure boundaries, dependency loading, revision identity, graph snapshots, and revision conflicts or expiry?

4. How does execution observation work today, including event ordering, current-node highlighting, terminal outcomes, failures, concurrent executions, client disconnects, and source changes received while an execution is active?

5. Which feature files, backend tests, browser acceptance bindings, fixtures, startup configuration, and test-server wiring currently define observable behavior for the live Workspace, and where do their UI contracts or assumptions differ?

6. What design-system and responsive implementation patterns currently govern the Workspace, including exact colors, typography, spacing, borders, shadows, theming, accessibility semantics, graph-node states, diagnostics, execution markers, and narrow-screen layout behavior?
