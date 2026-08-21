---
type: design-prd
---

# Connect the Runtime Visualizer Workspace to Live Backend Data

## Problem to Solve

The Runtime Visualizer presents a complete operator workspace, but its files, Procedures, source, graph, runs, revisions, diagnostics, and file-change status are local demonstration data. Operators cannot use the workspace to inspect or run the TypeScript program that the backend manages. The backend already provides source discovery, control-flow analysis, revision-bound execution, and file-change observation, but these capabilities are not available through the current browser experience.

This separation also leaves two different user contracts in the repository: the current workspace presents a file-and-Procedure workflow, while the browser acceptance bindings target an older form-based workflow. The product needs one browser experience whose visible behavior is driven by the live Runtime Visualizer domain.

## What does business success look like, and how can we measure it?

Success means an Operator can complete the full live workflow in the browser:

1. Select a backend-owned TypeScript file and Procedure.
2. View the matching source and complete control-flow graph.
3. Run the displayed revision.
4. See execution move through the graph and clear after completion.
5. Receive useful diagnostics when the graph or execution cannot proceed.

The release is successful when the browser acceptance scenarios for this workflow pass against the real backend, without fixed demonstration data supplying the observed results.

## Proposed Solution

Replace the workspace's demonstration data with the live Runtime Visualizer workflow. The browser uses backend-owned files, Procedures, source, graphs, revisions, execution events, diagnostics, and file-change events as the only product data source.

This workspace operates on saved project files only. It does not accept, analyse, or execute unsaved source supplied by the browser. The backend's saved project state is the source of every displayed analysis and executable revision.

The workspace has no silent demonstration fallback. When the backend is loading, empty, unavailable, or returns an error, the interface shows that state directly and keeps unavailable actions disabled.

## Solution Details

### The workspace always represents live backend state

The connected workspace preserves the current dark control-room layout, but all domain content comes from the live backend. Fixed files, Procedures, source, graph nodes, revisions, runs, diagnostics, connection labels, and simulated file changes do not appear as operational data.

The interface provides explicit states for:

- Initial loading.
- No supported source files.
- Backend unavailable or disconnected.
- Source or graph diagnostics.
- Revision unavailable at run time.
- Execution failure.

There is no automatic fallback to sample content. Actions that require unavailable data, including graph execution, remain disabled until the required live state is ready.

### Graph diagnostics replace only the invalid graph

If graph generation returns a diagnostic, the workspace keeps the latest source visible and replaces the graph with the diagnostic. Run remains disabled because there is no valid Control-flow graph for the displayed source and Procedure. The workspace does not retain or present a previous graph as current. A later successful graph refresh clears the diagnostic and restores Run.

If a live source or graph request fails for a transient backend error, the workspace keeps the selected file and Procedure, shows the failure in the affected panel, disables Run, and provides Retry. Retry repeats the failed live request for the current selection. The workspace does not retry indefinitely or clear the selection.

### Disconnection preserves the last useful workspace context

If the backend disconnects after a source and graph have loaded, the workspace keeps that content visible as the last known state and shows `Reconnecting`. Controls that require live backend data, including file and Procedure changes and new Executions, remain disabled. The workspace does not present the retained content as current.

If disconnection ends an active Execution stream, the workspace marks that Execution with a terminal `Interrupted` outcome and clears its graph marker. It does not keep the Execution active or start a replacement automatically.

The workspace retries the connection automatically. After reconnection, it performs a full live refresh of the available files and reloads the selected file and Procedure from backend data. If that selection is no longer available, it follows the selected-file deletion behavior. The Operator must explicitly start a new Execution. The workspace does not silently replace the retained content with demonstration data.

### Startup opens the first available graph

After the backend returns the supported TypeScript files, the workspace automatically selects the first file and its Top level Procedure. It then loads the matching source and graph without a separate confirmation action.

If no supported file exists, the workspace keeps both selectors and execution unavailable and shows the empty state. When the Operator selects another file, the workspace selects that file's Top level Procedure and loads its source and graph. Procedure selection then loads the graph for that Procedure.

When the backend detects a new supported TypeScript file, the workspace adds it to the file selector without changing the current selection. The new file becomes available for explicit selection without interrupting the Operator's current work.

When an unselected file changes, the workspace does not change the current selection or open that file. The workspace loads the file's newest revision when the Operator selects it.

If that file is a dependency of the displayed Procedure, the workspace keeps the current selection but refreshes the displayed Control-flow graph so it remains complete and valid. If a matching Execution is active, the workspace queues this graph refresh under the same revision-pinning policy and applies it after every matching Execution reaches a terminal Result.

### Every active Execution remains visible on the graph

When Executions overlap, the graph shows a distinct numbered and colored marker at the current Graph node of every active Execution. Selecting an Execution in the run inspector emphasizes its marker and dims the other active markers without hiding them. Each marker moves as its Execution progresses and clears when that Execution reaches a terminal Result. The run inspector retains the terminal outcome.

### Execution failure does not invalidate the workspace

If an Execution fails, its active graph marker clears and the run inspector shows a rose `Failed` terminal outcome with the available failure details. The displayed source and Control-flow graph remain visible because the failure does not make them invalid. If the displayed revision is still available, Run remains enabled so the Operator can start a new Execution. The workspace does not retry a failed Execution automatically.

The run inspector keeps completed, failed, and interrupted outcomes for the current browser session so the Operator can compare them. `Clear completed` removes all terminal outcomes while leaving active Executions unchanged. Reloading the browser also clears terminal outcomes. This integration does not persist Execution history across sessions.

### Selection changes do not cancel active Executions

The file and Procedure selectors remain available while Executions are active. Changing either selection loads that workspace and does not cancel or alter any active Execution. The run inspector continues to show every active Execution. The displayed graph shows markers only for Executions whose file, Procedure, and revision match the displayed workspace.

Selecting an active Execution in the run inspector opens its pinned file, Procedure, and revision. The graph then shows and emphasizes that Execution's marker while dimming other matching markers. This navigation does not cancel or alter any Execution.

### Active Executions keep the displayed revision stable

```task-artifact
.rpi/problems/frontend-backend-integration/show-me-revision-pinning-state.html
```

When the selected file changes and no active Execution matches the displayed file, Procedure, and revision, the workspace automatically loads the newest source and Control-flow graph. The displayed revision and the latest filesystem revision remain the same.

When one or more active Executions match the displayed workspace, the workspace keeps the displayed source and graph at their current revision. Each Execution remains pinned to that revision. The workspace shows an amber `Update queued` state and keeps only the newest observed revision for the selected file. Repeated changes replace the queued revision instead of creating a backlog. Active Executions for another file, Procedure, or revision do not block refresh of the displayed workspace.

After every matching active Execution reaches a terminal Result, the workspace automatically loads the newest queued source and graph and clears `Update queued`. The Operator does not see source or graph content move under an active Execution.

If the selected file is deleted with no active Execution, the workspace immediately selects the next available file and its Top level Procedure. If no supported file remains, it shows the empty state. If the file is deleted during an active Execution, the workspace keeps the displayed snapshot, shows `File deleted`, and prevents new Executions from starting from that file. After all active Executions reach a terminal Result, the workspace selects the next available file and its Top level Procedure, or shows the empty state.

If a file change removes the selected Procedure and no matching Execution is active, the workspace selects that file's Top level Procedure immediately. If a matching Execution is active, the workspace keeps its pinned Procedure visible and prevents new Executions from starting from it. After every matching Execution reaches a terminal Result, the workspace selects Top level and loads its current graph.

### An unavailable revision requires a new Run action

If the backend reports that the displayed revision is unavailable when the Operator starts an Execution, the workspace does not retry the Execution automatically. It reloads the newest source and Control-flow graph for the selected file and Procedure, shows `Revision expired — workspace refreshed`, and requires the Operator to start a new Execution. This prevents an Execution from silently using a revision that the Operator did not choose. If the file no longer exists, the workspace follows the selected-file deletion behavior.

## Out of Scope

- Analysing or executing unsaved, browser-supplied source.
- A demonstration mode backed by fixed browser data.
- Persistent Execution history across browser sessions.
- Automatic retry or replacement of failed, interrupted, or revision-unavailable Executions.
