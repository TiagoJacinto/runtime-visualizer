---
type: design-prd
---

# Live Execution Workspace

## Problem to Solve

Runtime Visualizer operators need one reliable workspace for selecting a saved TypeScript procedure, understanding its control-flow graph alongside its source, running that exact analyzed revision, and following execution through the graph. Today, the backend-connected page provides the live data but not the documented graph-first control-room experience, while the richer control-room UI is a disconnected local mock; this leaves the intended workflow split between two incompatible surfaces.

## What does business success look like, and how can we measure it?

Success is demonstrated when an operator can select a saved Procedure analysis revision, inspect its source and control-flow graph, run it, and follow its execution without leaving the live Workspace. Acceptance coverage must prove that concurrent runs continue while the operator changes Procedure or revision scope, that each run stays pinned to its chosen revision, and that newly available revisions never replace the operator’s selection automatically.

## Proposed Solution

Create one graph-first live Workspace for a selected saved file, Procedure, and analysis revision. A persistent secondary context rail switches between scope navigation and workspace-wide active runs without replacing the graph-and-source workspace. Concurrent runs remain independently visible at their current graph nodes without obscuring the static graph.

## Solution Details

### Pane-local controls keep the graph-first workspace legible

The desktop Workspace uses a persistent secondary context rail and a central Procedure workspace. The central workspace gives the control-flow graph more space than source; its graph panel sits left of the source panel. The selected scope is always named as `file › Procedure` with its revision, and `Run Procedure` is the sole primary action beside that identity.

Graph controls (`Imports off` and `Fit graph`) sit directly above the graph panel. `Hide code` sits directly above the source panel. Controls therefore stay adjacent to the surface they change, rather than becoming a detached shared toolbar. Selecting a graph node highlights its source range; selecting executable source highlights its graph node. This neutral focus remains visually distinct from live execution markers.

```task-artifact
.rpi/problems/implement-live-execution-workspace/mockup-graph-first-workspace.html
```

#### Runs continue while the operator changes Procedure scope

An operator may start any number of concurrent runs, including multiple runs of the same Procedure revision, then select another file or Procedure without stopping those earlier runs. Each active run remains pinned to the revision it started with and continues to receive its own progress and terminal outcome. Procedure selection changes the central source-and-graph scope; it must not cancel, replace, or otherwise disturb active runs outside that scope.

For the displayed Procedure revision, the graph shows one individually labelled live marker for every active run at its current node. Selecting a marker exposes a `Cancel run` action for that execution. The graph remains the complete possible control flow: completed paths and prior node visits are not left highlighted. When a run succeeds, fails, is cancelled, or is interrupted, its marker is removed and a brief run-specific notification communicates the terminal outcome. A failure notification includes the error summary; selecting it switches to the failed run’s Procedure analysis revision and focuses the corresponding source location.

#### Operators choose from durable Procedure analysis revisions

Each revision represents one analysis snapshot of the selected Procedure, including the source context and dependencies used to produce its graph. The revision control labels each option with only its abbreviated revision hash, exposes the selected Procedure’s retained analysis history, and keeps that history available across Workspace restarts. History retains all revisions from the last 30 days and at least the newest 20 revisions per Procedure; revisions used by active runs do not expire. The Workspace restores the operator’s last selected file, Procedure, and revision when reopened. If any saved selection is unavailable, it falls back to the first available file and Procedure.

Selecting a revision replaces the central source and graph with that analysis snapshot. `Run Procedure` remains available for every selectable runnable revision and starts a run pinned to the operator’s chosen snapshot. For a revision with graph-blocking diagnostics, the Workspace preserves its source, replaces the graph with the diagnostic, and disables execution only for that revision. Existing runs continue independently when the operator selects another revision.

When source changes produce a new Procedure analysis revision, the Workspace adds it to the revision selector without changing the operator’s displayed revision. A compact notification-style number badge beside the selector indicates how many newer revisions are available. Only an explicit operator selection replaces the displayed source and graph. Active runs remain pinned to their starting revisions and never delay or prevent revision selection or execution.

If a file or Procedure is later removed from the current source workspace, its durable historical analysis revisions remain selectable and runnable. If no files are available at startup, the Workspace shows an empty state explaining that no Procedures are available and provides a `Retry` action to reload available files.

#### Connection loss does not block saved revision execution

If live source updates disconnect, the Workspace keeps selectable analysis revisions available for inspection and execution. It shows reconnection status and retries automatically without disturbing active runs or changing the operator’s selected revision.

#### Refresh preserves layout while content loads

During initial loading or analysis refresh, the Workspace keeps the graph and source panel structure at its normal dimensions but hides their stale content. Local loading indicators remain visible above the affected panes, and the selected revision and `Run Procedure` action remain available. If the refresh fails unexpectedly, the last valid graph and source remain visible, a concise refresh error is shown, and `Retry` is available.

#### Workspace activity uses context tabs inside the secondary scope rail

The persistent secondary rail presents two adjacent context tabs: `Scope` and `Runs`. `Scope` shows file-and-Procedure navigation. `Runs` replaces only the rail content with the complete workspace-wide active-run list, including runs outside the displayed Procedure. Switching tabs never replaces or disturbs the graph-and-source workspace.

The active-run list scrolls independently so 30 or more concurrent runs remain reachable without widening the rail. Runs are ordered by start time, newest first. Each row shows Procedure, file, abbreviated revision, status, and direct `View` and `Cancel` actions. `View` selects that run’s file, Procedure, and revision in the main graph-and-source workspace without pausing, cancelling, or otherwise changing the run. Cancellation uses an inline safeguard: the first `Cancel` action changes that row to `Confirm cancel`; only the second action submits cancellation, without opening a modal. After `Confirm cancel`, the row leaves Active Runs immediately. A brief run-specific notification confirms that cancellation was requested.

Context tabs are confirmed at high confidence for these two contexts. The rail must not use a popover, drawer, overflow menu, or wide multi-column layout. If additional contexts make the tab strip too crowded, the design switches to the inline fallback: runs above and Procedure scope below. Adding overflow navigation requires another design review.

## To Be Considered

- A dedicated run-detail or run-history surface, including whether it should be persistent, app-wide, or filtered by the displayed Procedure/revision.
- Search within durable Procedure analysis revision history by abbreviated hash.

## Deferred to TDD

- How durable Procedure analysis revision history is stored and retained.
