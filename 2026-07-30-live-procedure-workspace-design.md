# Product Requirements Document: Live Procedure Workspace

**Date:** 2026-07-30  
**Status:** Updated to match the approved Live Control Room design  
**Product:** Runtime Visualizer  
**Validated UX:** Live Control Room workspace

## 1. Executive summary

Runtime Visualizer currently asks the Operator to provide browser-owned source and manually request a control-flow visualization. The product will become a live, route-driven workspace for backend-owned TypeScript files.

The Operator will select a file and one of its Procedures, immediately inspect an automatically rendered Mermaid control-flow graph, and launch any number of concurrent Executions. The backend will notify the frontend when files change. The frontend will refresh immediately when safe or defer one coalesced refresh until the selected Procedure's active Executions finish.

## 2. Problem statement

The current experience creates unnecessary friction and weakens the backend as the source of truth:

- Source files are uploaded or entered in the browser.
- Graph generation requires a manual Visualize control flow action.
- File and Procedure selection cannot be restored or shared through a URL.
- The UI does not react to backend filesystem changes.
- A running Procedure disables another Run action.
- Concurrent Executions cannot be tracked independently on the graph.

The Operator needs a persistent workspace that always reflects a selected backend-owned Procedure while preserving a stable graph during execution.

## 3. Target user

### Operator

A developer who selects a Procedure and inspects its control flow or runtime Execution.

The Operator needs to:

- Move quickly between backend-owned files and Procedures.
- Share or restore a selected Procedure through its URL.
- Understand possible control flow without a manual render step.
- Run the same Procedure repeatedly and concurrently.
- Distinguish concurrent Runs on one graph.
- Know when backend changes are current, queued, or invalid.

## 4. Product principles

1. **Backend-owned source:** the browser identifies files and Procedures; it does not upload source for analysis or execution.
2. **Selection is navigation:** File and Procedure selection are URL state.
3. **Graph is immediate:** selecting a valid Procedure automatically renders its graph.
4. **Runs are independent:** every Run Procedure click creates a separate Execution.
5. **Graph stability during execution:** all displayed Runs execute the revision represented by the displayed graph.
6. **Live but predictable:** file changes propagate automatically without changing the graph underneath active Runs.
7. **Presentation stays in the frontend:** the backend returns CFG data; the frontend converts it to Mermaid.

## 5. Goals

### G1. Remove manual graph visualization

A valid selected Procedure automatically produces a Mermaid graph without a Visualize control flow button.

### G2. Make backend files navigable

The backend exposes files and Procedures, and the frontend presents them as labeled native dropdowns.

### G3. Make Procedure pages restorable and shareable

The URL fully identifies the selected file and optional function Procedure.

### G4. React to filesystem changes

The backend publishes file events in real time. The frontend refreshes immediately or queues one safe refresh.

### G5. Support unrestricted concurrent Runs

Run Procedure remains enabled. Each click starts an independent Execution with its own stream, state, color, and sidebar entry.

### G6. Preserve graph-to-execution consistency

A Run always executes the immutable backend revision used to build the graph currently displayed.

## 6. Non-goals

The first release will not provide:

- Browser-based file editing
- Run history persistence across reloads
- Historical graph-revision comparison
- WebSocket commands
- Authentication or multi-user collaboration
- User-defined graph styling

## 7. Success criteria

The release is successful when all of the following are demonstrably true:

1. An Operator can open a URL and recover the same valid File and Procedure selection.
2. Selecting a Procedure renders its Mermaid graph without another action.
3. The Procedure dropdown contains Top level and the supported functions discovered in the selected file.
4. Repeated Run Procedure clicks create concurrent, independently tracked Runs.
5. Concurrent Runs appear as accessible, distinct colored markers on graph nodes.
6. A selected-file change with no active Runs refreshes automatically.
7. A selected-file change with active Runs shows `Update queued` and refreshes exactly once after the final active Run terminates.
8. A Run started while an update is queued still executes the revision represented by the displayed graph.
9. File, Procedure, graph, execution, and SSE failures remain local and recoverable.
10. The complete Operator journey passes automated acceptance coverage.
11. The workspace uses the Live Control Room shell: top bar, left navigation rail, graph workspace, and responsive Run inspector.
12. The Operator can switch between Graph and Source + graph views, show or hide imports, copy source, and use the graph search and fit controls.
13. Selecting a Run opens its status, current node, displayed revision, client execution ID, and event stream in the Run inspector on wide screens.
14. The Operator can open a contextual Diagnostics panel without losing the selected graph or Run state.

## 8. Validated user experience

### 8.1 Page structure

The selected design is the **Live Control Room** workspace.

The workspace is a full-height shell with a 56px top bar, a 268px left navigation rail, a flexible main area, and an optional 250px Run inspector on wide screens.

#### Top bar

The top bar contains, in order:

1. Responsive navigation toggle on narrow screens
2. Runtime Visualizer identity and `Live procedure workspace` label
3. Current file and Procedure breadcrumb
4. Connection status chip
5. Diagnostics action
6. Workspace settings action

The connection chip shows `Connected`, `Reconnecting`, or a local connection failure. The settings action is a frontend workspace-settings affordance and does not change backend configuration.

#### Left sidebar

In order:

1. Labeled native File dropdown
2. Labeled native Procedure dropdown
3. Always-enabled Run Procedure button
4. Collapsible Runs disclosure
5. Session summary with active-Run count and displayed revision

The Runs disclosure is open by default. Its list is vertical, newest-first, and scrollable after reaching its height limit. The sidebar becomes an off-canvas drawer below the large-screen breakpoint.

#### Main area

The main area contains:

1. An optional `Update queued` banner.
2. The selected Procedure heading, source location, and displayed revision.
3. A `Show imports` toggle and workspace view controls.
4. Four navigable tabs:
   - **Overview:** connection state, graph-node count, active-Run count, and queued-update state.
   - **Source + graph:** read-only source beside the graph on wide screens, with a stacked layout on smaller screens.
   - **Graph:** Mermaid control-flow graph and concurrent Execution markers.
   - **Diagnostics:** graph, file, selection, revision, SSE, and execution diagnostics.

Tabs support pointer interaction and left/right arrow-key navigation. The graph has accessible `Search graph` and `Fit graph` controls. The graph receives all available main-area width; the Runs list stays in the left sidebar.

#### Run inspector

Selecting a Run opens the Run inspector on wide screens. It shows the Run status, current node, start time, displayed revision, client execution ID, and a readable event stream. It is hidden below the wide-screen breakpoint; the Run remains available in the left sidebar.

#### Diagnostics panel

The Diagnostics action opens a contextual panel over the workspace and selects the Diagnostics view. The panel shows connection, selection, graph, revision, filesystem, SSE, and execution diagnostics. The Diagnostics tab provides the same information as a full workspace view. Closing the panel preserves the selected tab, graph, and Run state.

### 8.2 File and Procedure selection

The File dropdown is populated from the backend's configured files folder.

For `main.ts`, the Procedure dropdown follows this form:

```text
Top level (main.ts)
prepare()
classify()
run()
```

The actual function options come from backend Procedure discovery and appear in source order.

Changing File:

1. Updates the URL.
2. Requests that file's Procedures.
3. Selects Top level unless the URL names a valid function.
4. Loads source and CFG for the resulting selection.

Changing Procedure updates the URL and automatically loads its source context and CFG.

### 8.3 URL behavior

Canonical function route:

```text
/procedure?file=main.ts&name=prepare
```

Canonical Top level route:

```text
/procedure?file=main.ts
```

Requirements:

- Browser reload restores the same valid selection.
- Back and forward navigation restore previous selections.
- Selector changes use client-side navigation.
- Invalid requested values remain visible with a diagnostic; the product does not silently reinterpret the URL as another Procedure.

### 8.4 Graph behavior

- There is no Visualize control flow button.
- The frontend converts CFG nodes and edges into escaped Mermaid source.
- A newer selection supersedes stale in-flight responses.
- Diagnostics replace obsolete graph content.
- The graph includes a textual fallback derived from CFG nodes and transitions.
- The Overview view summarizes connection state, graph-node count, active-Run count, and queued-update state.
- The graph receives the available horizontal space; Runs never create a second sidebar.
- `Search graph` focuses matching node labels and exposes the match count.
- `Fit graph` restores the complete graph to the available viewport.
- Graph controls have visible labels or accessible names and do not change the displayed CFG revision.

### 8.5 Source behavior

- Source is read-only and comes from the backend-selected file.
- Source shows line numbers and the selected Procedure source range when available.
- `Show imports` controls contextual import nodes in the CFG without changing source contents.
- `Copy source` copies the displayed source and reports success or failure locally.
- Source and graph use the same displayed revision.

### 8.6 Run behavior

Every click creates one Execution with:

- Unique client ID
- Stable accessible marker color
- Start time
- Current graph-node ID
- Status: `running`, `succeeded`, or `failed`
- Optional terminal error
- Independent NDJSON stream and cancellation lifecycle
- The displayed CFG revision

The Run Procedure button never becomes disabled because another Run is active.

Completed and failed Runs remain in the current page session. A terminal Run clears its active graph marker.

A node may show multiple markers. Marker identity is communicated through color and a textual Run label.

### 8.7 Diagnostics behavior

- Diagnostics remain local to the affected resource or Run.
- Opening or closing the Diagnostics panel does not reload the graph.
- The Diagnostics tab and contextual panel show the same current diagnostic state.
- A failed Run shows its terminal error in the Run list, Run inspector, and Diagnostics panel when selected.
- A queued update remains visible until the deferred refresh completes; it cannot be dismissed as if the update were applied.

## 9. Functional requirements

### FR-1. List files

The backend shall return the deterministic list of regular file paths beneath the configured files folder.

- Results derive from filesystem directory entries.
- Paths are relative and use forward slashes.
- Symbolic links and hidden directories are skipped.
- A missing configured folder returns an empty list.

### FR-2. Discover Procedures

The backend shall accept a selected file path and return:

- One Top level Procedure
- Every supported function Procedure in source order
- Stable Procedure identifiers and display labels

### FR-3. Read source

The backend shall return read-only source and a revision identifier for the selected file.

### FR-4. Build a selected CFG

The backend shall build a CFG from backend-owned source for the selected file and optional function.

The response shall include the analyzed revision and diagnostics. The frontend shall not send source text or dependency maps.

### FR-5. Render Mermaid automatically

The frontend shall request and render CFG data whenever the resolved File or Procedure selection changes.

### FR-6. Publish file events

The backend shall publish `added`, `modified`, and `deleted` events through SSE. Each event includes file path and revision.

### FR-7. Coordinate refreshes

For a selected-file event:

- Refresh immediately when the selected Procedure has no active Runs.
- Otherwise mark the view stale, show `Update queued`, and defer.
- Coalesce additional selected-file events.
- Refresh once after the final active Run terminates.

For an unselected-file event, revalidate only dependent project/file-list state.

### FR-8. Start concurrent Executions

Each Run Procedure action shall start an independent backend request and frontend Run record.

### FR-9. Bind Runs to displayed revisions

The execution request shall include the revision returned with the displayed CFG. The backend shall execute the immutable snapshot associated with that revision.

Runs started while a newer update is queued shall continue to use the displayed revision.

### FR-10. Track concurrent Runs

The frontend shall consume every Execution stream independently and update the corresponding Run entry and graph marker.

### FR-11. Handle disappeared selections

If a refreshed function no longer exists:

- Preserve the selected file.
- Clear obsolete Procedure graph data.
- Keep the invalid requested function visible as an error.
- Present the newly available Procedure choices.

If the file disappeared, refresh Files and show a file-not-found diagnostic.

### FR-12. Reconnect live updates

The frontend shall reconnect SSE automatically, show `Reconnecting`, and revalidate the current selection after reconnection.

### FR-13. Provide the Live Control Room workspace

The frontend shall implement the approved shell with a top bar, left navigation rail, main graph workspace, responsive off-canvas navigation, and optional wide-screen Run inspector.

### FR-14. Provide source and graph controls

The Source + graph view shall show read-only source, line numbers, the `Show imports` toggle, and a working `Copy source` action. The Graph view shall provide working `Search graph` and `Fit graph` actions.

### FR-15. Provide contextual Run inspection

Selecting a Run shall show its status, current node, start time, displayed revision, client execution ID, and event stream. This information shall remain available when the Run is not active.

### FR-16. Provide Overview and contextual diagnostics

The Overview tab shall show connection state, graph-node count, active-Run count, and queued-update state. The Diagnostics tab shall show connection, selection, graph, revision, filesystem, SSE, and execution state. The Diagnostics action shall open the same content in a local panel. Closing it shall preserve workspace state.

## 10. Backend interface requirements

### `GET /api/files`

Returns file paths.

### `GET /api/procedures?file=<path>`

Example:

```json
{
  "file": "main.ts",
  "procedures": [
    { "id": "top-level", "kind": "TopLevel", "name": null, "label": "Top level (main.ts)" },
    { "id": "function:prepare", "kind": "Function", "name": "prepare", "label": "prepare()" }
  ]
}
```

Procedure IDs are deterministic for a file revision. The frontend uses the Procedure name in the canonical URL for compatibility, and uses the ID to disambiguate duplicate names within a response.

### `GET /api/source?file=<path>`

Returns source and revision.

### `GET /api/cfg?file=<path>&name=<optional-function>`

Returns CFG, diagnostics, and analyzed revision. Building this response creates or refreshes the short-lived immutable execution snapshot for that revision.

### `GET /api/events`

SSE payload:

```json
{
  "type": "file-changed",
  "file": "main.ts",
  "change": "modified",
  "revision": "revision-id"
}
```

### `POST /api/execute`

Request:

```json
{
  "file": "main.ts",
  "name": "prepare",
  "revision": "displayed-cfg-revision"
}
```

The response is NDJSON node events followed by one terminal Result.

Snapshots remain available for a bounded retention period and while referenced by active Executions. An unavailable revision returns `409 Revision unavailable`; the failed Run remains visible and the frontend revalidates.

All file-taking endpoints reject traversal outside the configured folder.

## 11. Frontend capability requirements

The implementation shall separate these responsibilities:

- URL selection state
- File resource
- Procedure resource
- Source and CFG workspace resource
- CFG-to-Mermaid conversion, marker placement, and textual fallback
- Source controls and graph controls
- SSE subscription and reconnect state
- Concurrent Execution registry and Run inspector
- Diagnostics panel state
- Deferred-refresh coordinator

No module shall depend on another module's private state.

## 12. State and lifecycle rules

### 12.1 Initial load

1. Parse URL.
2. Load Files.
3. Validate requested File.
4. Load Procedures.
5. Validate requested function or resolve Top level.
6. Load source and CFG.
7. Render the Graph tab and live status.
8. Keep the Overview, Source + graph, and Diagnostics views available when their data is ready.

### 12.2 File change without active Runs

1. Receive selected-file SSE event.
2. Mark current resources stale.
3. Refresh Procedures, source, and CFG.
4. Preserve selection if valid.
5. Render the latest revision.

### 12.3 File change with active Runs

1. Receive selected-file SSE event.
2. Show `Update queued`.
3. Keep the displayed graph unchanged.
4. Continue all Runs against their immutable revision snapshot.
5. Bind additional Run clicks to the displayed revision.
6. Coalesce later events.
7. Refresh once after all active Runs terminate.

### 12.4 Concurrent Execution

Each stream updates only its Run record. One failed stream does not cancel or alter another.

## 13. Error and recovery requirements

| Failure | Required behavior |
| --- | --- |
| File list | Keep workspace shell visible and offer retry |
| Procedure list | Preserve File and show inline diagnostic |
| Source or CFG | Clear obsolete graph and show diagnostics |
| Invalid URL | Preserve requested values visibly and explain the invalid resource |
| SSE disconnect | Show reconnecting, retry, then revalidate |
| Individual Execution | Fail only that Run |
| Deleted selected file | Refresh Files and show file-not-found state |
| Missing selected function | Preserve File, clear graph, show available Procedures |
| Stale response | Ignore response whose selection or revision is no longer current |
| Expired execution revision | Return `409`, fail that Run visibly, and revalidate |

## 14. Accessibility requirements

- Use native labeled selects for File and Procedure.
- Use `tablist`, `tab`, `aria-selected`, associated panels, and arrow-key navigation for Overview, Source + graph, Graph, and Diagnostics.
- Use a labeled dialog or complementary panel for Diagnostics and close it with Escape.
- Give every icon-only action an accessible name and visible focus state.
- Do not communicate Run identity or status by color alone.
- Label each graph marker with its Run identity.
- Announce connection, queued-update, copy, and Run state changes without excessive live-region noise.
- Provide a textual graph fallback.
- Keep the Runs disclosure keyboard operable through native semantics.

## 15. Acceptance criteria

### AC-1. Automatic graph

Given a valid routed Procedure, when the workspace loads, then its Mermaid graph appears without a visualization action.

### AC-2. Procedure discovery

Given `main.ts`, when Procedures load, then the dropdown contains Top level and its discovered functions in source order.

### AC-3. URL synchronization

Given the Operator changes File or Procedure, when selection resolves, then the URL represents that selection and reload restores it.

### AC-4. Concurrent repeated Runs

Given a selected Procedure, when the Operator clicks Run Procedure multiple times, then every click starts an independent Run and the button remains enabled.

### AC-5. Concurrent markers

Given multiple active Runs, when node events arrive, then each Run has a distinct accessible graph marker, including when multiple Runs occupy one node.

### AC-6. Immediate refresh

Given no active Runs, when the selected file changes, then Procedures, source, and CFG refresh automatically.

### AC-7. Deferred refresh

Given active Runs, when the selected file changes, then the graph remains stable, `Update queued` appears, and one refresh occurs after the last Run terminates.

### AC-8. Run during queued update

Given a newer file revision is queued, when the Operator starts another Run, then it executes the displayed CFG revision and emits node IDs valid for that graph.

### AC-9. Navigable workspace views

Given the Live Control Room workspace, when the Operator clicks a tab or uses left/right arrows, then the corresponding Overview, Source + graph, Graph, or Diagnostics panel becomes active.

### AC-10. Collapsible Runs

Given Runs exist, when the Operator toggles Runs, then the vertical scrollable list expands or collapses without affecting graph width.

### AC-11. Local failure isolation

Given one Run fails, when its terminal Result arrives, then that Run shows failed while other Runs continue.

### AC-12. Selection disappears

Given the selected function is removed, when deferred or immediate refresh occurs, then the File remains selected, obsolete graph content clears, and available Procedures are shown.

### AC-13. Source and graph controls

Given a selected Procedure, when the Operator opens Source + graph, toggles Show imports, copies source, searches the graph, or fits the graph, then each action changes only its local presentation state and keeps the displayed revision unchanged.

### AC-14. Run inspector

Given a Run exists, when the Operator selects it, then the wide-screen inspector shows its status, current node, start time, displayed revision, client execution ID, and event stream.

### AC-15. Diagnostics panel

Given a selected Procedure, when the Operator opens Diagnostics, then connection, selection, graph, revision, filesystem, and execution state are visible without replacing the graph.

### AC-16. Responsive workspace

Given a narrow viewport, when the Operator opens navigation or selects a Run, then the navigation rail becomes an off-canvas drawer and Run details remain available without making the graph horizontally unusable.

## 16. Test requirements

### Backend

- Deterministic filesystem-derived file listing
- Procedure discovery and Top level inclusion
- Source-order function results
- Path traversal rejection
- Backend-owned source and dependency resolution
- CFG revision snapshot creation
- Independent concurrent Executions
- Snapshot consistency after disk changes
- Snapshot expiry and `409` behavior
- SSE added, modified, and deleted events

### Frontend

- URL restoration and browser navigation
- File and Procedure selector synchronization
- Top level and function rendering
- CFG-to-Mermaid escaping and edge preservation
- Overview, Source + graph, Graph, and Diagnostics tab pointer and keyboard navigation
- Read-only source, Show imports, Copy source, Search graph, and Fit graph
- Repeated Run clicks and independent streams
- Multiple markers, including same-node markers
- Collapsible vertical scrollable Runs and Run inspector
- Diagnostics panel and local failure display
- Responsive navigation and graph layout
- Immediate refresh
- Deferred and coalesced refresh
- Run binding during queued updates
- Deletion, stale responses, SSE reconnect, and local Run failure

### Acceptance

One end-to-end journey covers routed selection, automatic graph rendering, repeated concurrent Runs, colored markers, Runs disclosure, a backend file change, queued state, and one safe graph refresh after all Runs finish.

## 17. Dependencies and constraints

- Existing TypeScript CFG analyzer and diagnostics
- Existing Fastify backend
- Existing React frontend
- Mermaid renderer
- React Router
- Backend filesystem watcher with SSE support
- Immutable revision snapshot storage with bounded retention

## 18. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| File changes invalidate graph node IDs during a Run | Execute the displayed immutable revision snapshot |
| Many Runs produce visual noise | Stable colors, textual labels, collapsible scrollable list |
| SSE reconnect misses changes | Revalidate current resources after reconnect |
| Rapid changes trigger excess analysis | Coalesce queued selected-file events |
| Procedure disappears after refresh | Preserve File, clear obsolete graph, show choices and diagnostic |
| Snapshot retention grows memory | Bound retention and release unreferenced snapshots |
| Out-of-order resource responses overwrite current state | Compare selection and revision before commit |
| Mermaid marker placement becomes unstable when the graph resizes | Keep markers in a separate accessible overlay tied to rendered node bounds and retain the textual Run list as the source of truth |
| Dense controls reduce graph space on small screens | Move navigation off canvas, hide the Run inspector, and stack Source + graph below the responsive breakpoint |
| A design control implies unsupported behavior | Define and test each visible control or remove it before release |

## 19. Rollout sequence

1. Add backend-owned source and Procedure contracts.
2. Add revision-aware CFG and Execution contracts.
3. Add SSE file events.
4. Build route-driven File and Procedure selection.
5. Build the Live Control Room shell and automatic Mermaid rendering.
6. Add Source + graph controls, diagnostics panel, and responsive Run inspector.
7. Add concurrent Execution registry, markers, and Runs disclosure.
8. Add deferred-refresh coordination and recovery states.
9. Remove local file upload, editable source inputs, dependency editor, and Visualize control flow button.
10. Complete acceptance verification.

## 20. Product decision record

The following choices are settled for this release:

- SSE instead of WebSocket or polling
- Query-parameter route
- Frontend-owned CFG-to-Mermaid transformation
- Backend-owned files and source
- Separate backend Procedure-discovery endpoint
- Live Control Room workspace
- 56px top bar with identity, breadcrumb, connection status, Diagnostics, and settings actions
- Vertical File and Procedure controls
- Run Procedure in the left sidebar
- Collapsible vertical scrollable Runs in the same sidebar
- Always-enabled Run Procedure
- Optional wide-screen Run inspector
- Overview, Source + graph, Graph, and Diagnostics tabs
- Show imports and Copy source controls
- Search graph and Fit graph controls
- Contextual Diagnostics panel
- Multiple colored active-node markers
- Refresh after all displayed active Runs finish
- Immutable displayed-revision snapshots for new and active Runs
