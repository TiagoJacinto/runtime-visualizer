# Live Procedure Workspace Design

**Date:** 2026-07-30  
**Status:** Approved design

## Goal

Turn Runtime Visualizer from a manual, browser-owned source demo into a live workspace for inspecting and running backend-owned TypeScript Procedures.

The Operator selects a file and Procedure, sees its Mermaid control-flow graph immediately, launches any number of concurrent Executions, and receives backend file changes without manually rebuilding the graph.

## Product decisions

- The backend is the source of truth for files and source text.
- The URL is the source of truth for the selected file and Procedure.
- The frontend renders Mermaid from the backend's control-flow graph contract.
- The backend publishes file changes with Server-Sent Events (SSE).
- File-triggered graph refreshes wait until every active Execution for the selected Procedure finishes.
- Run Procedure is always enabled; every click creates an independent Execution.
- Concurrent Executions use distinct colored markers on graph nodes.
- The chosen UX is the **H1 — Balanced tabs** wireframe.

## Operator journey

1. Open the Procedure workspace.
2. Select a backend-owned file.
3. Select Top level or a function Procedure discovered in that file.
4. Inspect Overview, Source, Graph, or Diagnostics.
5. Click Run Procedure any number of times.
6. Observe concurrent Runs in the sidebar and colored markers in the graph.
7. Receive file updates automatically; if Runs are active, see that an update is queued until they finish.

## URL model

The workspace route uses query parameters:

```text
/procedure?file=main.ts&name=prepare
```

- `file` identifies a path returned by `GET /api/files`.
- `name` identifies a function Procedure.
- Omitting `name` selects the file's Top level Procedure.
- Browser refresh, back/forward navigation, and shared links restore the same selection.
- Selecting a file or Procedure updates the URL without a full-page navigation.

Invalid or stale URL selections remain visible as errors rather than silently selecting a different Procedure.

## User experience

### H1 balanced workspace

The page has one left sidebar and one main content area.

The sidebar contains, in order:

1. A vertical File dropdown.
2. A vertical Procedure dropdown.
3. An always-enabled Run Procedure button.
4. A collapsible Runs disclosure containing a vertical, scrollable Runs list.

The Procedure dropdown contains:

- `Top level (<selected-file>)`
- Every supported function Procedure returned for the selected file

The main content area contains navigable tabs:

- **Overview:** live status, graph-node count, active-Run count, and queued-update state.
- **Source:** read-only source for the selected Procedure's file.
- **Graph:** the Mermaid control-flow graph and concurrent Execution markers.
- **Diagnostics:** graph, source, file-watch, and connection diagnostics.

Tabs support pointer activation and left/right arrow-key navigation. The Graph tab receives the available horizontal space; Runs do not consume a second sidebar.

### Reactive graph behavior

There is no Visualize control flow button.

Selecting a valid Procedure automatically requests and renders its graph. A newer selection supersedes stale in-flight responses. Diagnostics replace stale graph content instead of leaving an obsolete graph visible.

The frontend transforms CFG nodes and edges into escaped Mermaid source. The backend remains independent of Mermaid.

## Backend architecture

The backend owns filesystem access and exposes focused resource endpoints.

### `GET /api/files`

Returns the deterministic list of regular file paths beneath the configured files folder.

The list is derived from filesystem directory entries, not hardcoded data. Existing safety rules remain: paths are relative, symbolic links and hidden directories are skipped, and a missing configured folder produces an empty list.

### `GET /api/procedures?file=<path>`

Reads and analyzes the selected backend-owned file and returns its available Procedures.

Example response:

```json
{
  "file": "main.ts",
  "procedures": [
    { "kind": "TopLevel", "name": null, "label": "Top level (main.ts)" },
    { "kind": "Function", "name": "prepare", "label": "prepare()" }
  ]
}
```

The Top level option is always present for a supported file. Function entries use source order and stable identifiers.

### `GET /api/source?file=<path>`

Returns read-only source text and a revision identifier for the selected backend-owned file.

### `GET /api/cfg?file=<path>&name=<optional-function>`

Builds the CFG for the selected backend-owned Procedure. The frontend no longer sends source text or a dependency map. The backend resolves required files from its configured folder.

The response includes the file revision used for analysis so the frontend can reject stale results. The backend also retains an immutable, short-lived snapshot for that analyzed revision. The snapshot is the execution input corresponding to the displayed graph.

### `GET /api/events`

Provides an SSE stream of backend file events:

```json
{
  "type": "file-changed",
  "file": "main.ts",
  "change": "modified",
  "revision": "revision-id"
}
```

`change` is `added`, `modified`, or `deleted`. The client reconnects automatically and treats reconnection as a reason to revalidate the current file and Procedure.

### `POST /api/execute`

Starts one independent Execution for the selected backend-owned Procedure. The request identifies the file, optional function name, and the revision returned with the displayed CFG; it does not upload source.

```json
{
  "file": "main.ts",
  "name": "prepare",
  "revision": "displayed-cfg-revision"
}
```

The backend executes the immutable snapshot for that revision, not whatever source happens to be newest on disk. Therefore, repeated clicks made while a newer file update is queued still produce node IDs that belong to the graph currently on screen.

Snapshots remain available for a bounded retention period and while referenced by active Executions. If a requested snapshot has expired, the endpoint returns `409 Revision unavailable`; that Run fails visibly and the frontend revalidates the selected Procedure.

The response remains an NDJSON stream containing node events followed by one terminal Result. Concurrent requests are independent and are not serialized by the UI.

## Frontend architecture

The current high-complexity `App` component is split into focused modules:

- **Procedure route:** parses and writes URL selection state.
- **File resource:** loads available backend files.
- **Procedure resource:** loads Top level and function choices for a file.
- **Procedure workspace:** coordinates source, CFG, diagnostics, and tabs.
- **Mermaid graph:** converts CFG data, renders Mermaid, and overlays Execution markers.
- **File-event subscriber:** owns SSE connection and reconnect state.
- **Execution registry:** owns all concurrent Run streams and terminal results.
- **Refresh coordinator:** coalesces file events and decides when CFG data may refresh.

Each module exposes state through a narrow interface and does not read another module's internal state directly.

## Execution model

Every Run Procedure click creates an Execution record with:

- A unique client-generated ID
- A stable marker color from an accessible palette
- Start time
- Current graph-node ID
- Status: `running`, `succeeded`, or `failed`
- Optional terminal error
- Its own NDJSON reader and cancellation lifecycle

The Run Procedure button never enters a disabled state.

The Runs disclosure is open by default, collapsible, vertically ordered newest first, and scrollable after reaching its height limit. Completed and failed Runs remain visible for the current page session.

A graph node may display multiple colored markers. Each marker maps back to its Run entry by color and accessible label. A Run clears its active-node marker when it reaches a terminal Result.

## File-change lifecycle

For an SSE event affecting an unselected file, the client revalidates only data that depends on the project file list.

For an event affecting the selected file:

1. Mark the selected Procedure data stale.
2. If no Runs for that Procedure are active, refresh Procedures, source, and CFG immediately.
3. If one or more Runs are active, show `Update queued` and defer refresh.
4. Coalesce any additional events for the same selected file.
5. When all active Runs for that Procedure terminate, refresh once using the latest revision.
6. If the selected Procedure still exists, preserve the route and selection.
7. If it disappeared, preserve the file selection, clear obsolete graph data, and show a Procedure-selection error with the newly available choices.

Every new Execution starts against the revision of the graph currently displayed, including Runs started after a newer file event has been queued. An Execution continues against that immutable snapshot, and the graph never changes underneath an active Run.

## Error handling

- **File-list failure:** keep the workspace shell visible and offer retry.
- **Procedure-list failure:** preserve the file selection and show an inline diagnostic.
- **Source or CFG failure:** clear stale graph content and show diagnostics.
- **Invalid URL:** retain the requested values visibly and explain which resource was not found.
- **SSE disconnect:** show `Reconnecting`, retry automatically, and revalidate after reconnecting.
- **Execution failure:** fail only that Run; other Runs continue.
- **File deletion:** refresh files, clear obsolete Procedure data, and explain that the selected file no longer exists.
- **Out-of-order response:** ignore any response whose selection or revision is no longer current.

## Accessibility

- File and Procedure controls use native labeled selects.
- Tabs use `tablist`, `tab`, `aria-selected`, keyboard navigation, and associated panels.
- Run state does not rely on color alone; each marker and Run has a textual identity and status.
- Live connection and queued-update status use restrained live-region announcements.
- The Mermaid graph has a textual fallback derived from CFG nodes and transitions.

## Testing strategy

### Backend

- File listing remains deterministic and filesystem-derived.
- Procedure discovery returns Top level and supported functions in source order.
- Source and CFG endpoints reject paths outside the configured folder.
- CFG and Execution use backend-owned source and dependency resolution.
- SSE emits added, modified, and deleted events and survives watcher churn.
- Concurrent Execution requests remain independent.
- Execution revision snapshots produce node IDs from the displayed CFG even after the file changes on disk.
- Expired execution snapshots return `409` and trigger frontend revalidation.

### Frontend

- URL state restores File and Procedure selections.
- Dropdown changes update the URL and fetch the correct resources.
- Top level and function choices render from the Procedure endpoint.
- CFG-to-Mermaid conversion escapes labels and preserves nodes, edges, and outcomes.
- Tab pointer and keyboard navigation select the correct panel.
- Repeated Run clicks create independent Run entries and streams bound to the displayed CFG revision.
- Multiple Run markers render concurrently, including multiple markers on one node.
- Runs are collapsible, vertical, newest-first, and scrollable.
- Selected-file events refresh immediately with no active Runs.
- Selected-file events queue and coalesce while Runs are active.
- Deferred refresh happens once after the final active Run terminates.
- Deletion, stale responses, SSE reconnect, and individual Run failure preserve valid surrounding state.

### Acceptance journey

An end-to-end scenario covers opening a routed Procedure page, switching File and Procedure, viewing the automatic Mermaid graph, launching repeated concurrent Runs, observing colored markers and the Runs drawer, changing the backend file, seeing `Update queued`, and receiving one refreshed graph after all Runs finish.

## Migration and scope

The current local file upload, editable source fields, dependency-file editor, and Visualize control flow button are removed from the primary workspace.

This design does not include:

- Editing backend files from the browser
- Persisting Run history across page reloads
- Comparing historical graph revisions
- WebSocket commands
- Authentication or multi-user collaboration
- Polished visual styling beyond the validated H1 information architecture
