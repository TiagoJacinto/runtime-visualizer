---
type: design-prd
---

# Live Execution Workspace

## Problem to Solve

Runtime Visualizer operators need one reliable workspace for selecting a saved TypeScript procedure, understanding its control-flow graph alongside its source, running that exact analyzed revision, and following execution through the graph. Today, the backend-connected page provides the live data but not the documented graph-first control-room experience, while the richer control-room UI is a disconnected local mock; this leaves the intended workflow split between two incompatible surfaces.

## What does business success look like, and how can we measure it?

Success is demonstrated when an operator can select a saved procedure, inspect its source and control-flow graph, run the displayed revision, and follow its execution through to a terminal outcome without leaving the live Workspace. Acceptance coverage must prove that active runs continue while the operator changes Procedure scope, and that a source change during active runs preserves the displayed revision until every matching active run finishes, then refreshes to the changed source.

## Proposed Solution

Create one graph-first live Workspace for a selected saved file and Procedure. It combines scope selection, a revision-labelled control-flow graph and source view, and a primary run action so an operator can understand possible flow before executing the exact displayed revision. Concurrent runs remain independently visible at their current graph nodes without obscuring the static graph.

## Solution Details

#### Pane-local controls keep the graph-first workspace legible

The desktop Workspace uses a persistent scope rail and a central Procedure workspace. The central workspace gives the control-flow graph more space than source; its graph panel sits left of the source panel. The selected scope is always named as `file › Procedure` with its revision, and `Run Procedure` is the sole primary action beside that identity.

Graph controls (`Imports off` and `Fit graph`) sit directly above the graph panel. `Hide code` sits directly above the source panel. Controls therefore stay adjacent to the surface they change, rather than becoming a detached shared toolbar. Selecting a graph node highlights its source range; selecting executable source highlights its graph node. This neutral focus remains visually distinct from live execution markers. On narrow screens, scope becomes an explicit drawer and the graph takes precedence when only one main surface fits.

```task-artifact
.rpi/problems/implement-live-execution-workspace/mockup-graph-first-workspace.html
```

#### Runs continue while the operator changes Procedure scope

An operator may start any number of concurrent runs, including multiple runs of the same Procedure revision, then select another file or Procedure without stopping those earlier runs. Each active run remains pinned to the revision it started with and continues to receive its own progress and terminal outcome. Procedure selection changes the central source-and-graph scope; it must not cancel, replace, or otherwise disturb active runs outside that scope.

For the displayed Procedure revision, the graph shows one individually labelled live marker for every active run at its current node. Selecting a marker exposes a `Cancel run` action for that execution. The graph remains the complete possible control flow: completed paths and prior node visits are not left highlighted. When a run succeeds, fails, is cancelled, or is interrupted, its marker is removed and a brief run-specific notification communicates the terminal outcome. A failure notification includes the error summary; selecting it switches to the failed run’s Procedure analysis revision and focuses the corresponding source location.

#### Operators choose from durable Procedure analysis revisions

Each revision represents one analysis snapshot of the selected Procedure, including the source context and dependencies used to produce its graph. The revision control labels each option with only its abbreviated revision hash, exposes the selected Procedure’s complete analysis history, and keeps that history available across Workspace restarts.

Selecting a revision replaces the central source and graph with that analysis snapshot. `Run Procedure` remains available for every selectable runnable revision and starts a run pinned to the operator’s chosen snapshot. For a revision with graph-blocking diagnostics, the Workspace preserves its source, replaces the graph with the diagnostic, and disables execution only for that revision. Existing runs continue independently when the operator selects another revision.

When source changes produce a new Procedure analysis revision, the Workspace adds it to the revision selector without changing the operator’s displayed revision. A compact notification-style number badge beside the selector indicates how many newer revisions are available. Only an explicit operator selection replaces the displayed source and graph. Active runs remain pinned to their starting revisions and never delay or prevent revision selection or execution.

If a file or Procedure is later removed from the current source workspace, its durable historical analysis revisions remain selectable and runnable.

#### Connection loss does not block saved revision execution

If live source updates disconnect, the Workspace keeps selectable analysis revisions available for inspection and execution. It shows reconnection status and retries automatically without disturbing active runs or changing the operator’s selected revision.

#### Workspace activity replaces the secondary scope rail instead of opening a popover

A slim icon activity bar sits immediately left of the scope rail. Its `Runs` icon replaces the scope rail’s contents with the complete workspace-wide active-run list, including runs outside the displayed Procedure; its `Scope` icon restores the file-and-Procedure navigation. The run list supports its own scrolling so any number of concurrent runs remain reachable without an oversized or separately scrolling popover. Each run exposes its Procedure, revision, status, and direct controls to focus or cancel it.

## To Be Considered

- A dedicated run-detail or run-history surface, including whether it should be persistent, app-wide, or filtered by the displayed Procedure/revision.

## Deferred to TDD

- How durable Procedure analysis revision history is stored and retained.
