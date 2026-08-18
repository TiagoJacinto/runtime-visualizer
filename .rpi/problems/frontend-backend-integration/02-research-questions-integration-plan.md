# Research Questions: Frontend–Backend Integration

## Topic

Understand the current frontend and backend architecture, contracts, capabilities, and constraints that affect the Runtime Visualizer workspace.

## Key Context Pointers

- `browser/src/components/generated/LiveProcedureWorkspace.tsx`
- `browser/src/App.tsx`
- `browser/vite.config.ts`
- `backend/src/shared/infra/http/app.ts`
- `backend/src/modules/source/http.ts`
- `backend/src/modules/cfg/http.ts`
- `backend/src/modules/execution/http.ts`
- `backend/src/modules/cfg/types.ts`
- `backend/src/modules/source/types.ts`
- `backend/tests/typical/integration/`
- `browser/tests/acceptance/e2e/`
- `features/`
- `backend/features/observe-procedure-changes.feature`
- `DESIGN.md`
- `PRODUCT.md`
- `CONTEXT.md`

## Research Questions

1. How is the browser workspace currently structured, which displayed values and interactions are local or fixed, and how does state move through `App.tsx` and `LiveProcedureWorkspace.tsx`?

2. Which Fastify endpoints exist for files, source, procedures, control-flow graphs, execution, and source-change events, and what are their exact request, success, error, and streaming response contracts?

3. How do backend-owned files, procedure selection, source revisions, graph snapshots, and execution revisions relate across the source, CFG, execution, and revision-store modules?

4. What control-flow graph data does the backend expose for nodes, edges, source locations, imports, diagnostics, and procedure boundaries, and which TypeScript constructs and error cases are represented?

5. How do execution and file-change streams behave today, including event ordering, concurrency, completion, failure, revision expiry, disconnects, and changes received while executions are active?

6. Which current feature scenarios and browser/backend tests define observable behavior for file selection, procedure selection, graph rendering, imports, diagnostics, execution highlighting, and multi-file programs?

7. What development and production connection mechanisms exist today, including the Vite proxy, configured ports and source folder, same-origin assumptions, CORS behavior, startup commands, and error handling?

8. What design system and component patterns govern this workspace, including exact colors, typography, spacing, borders, shadows, responsive behavior, accessibility, theming, graph nodes, diagnostics, and execution markers?
