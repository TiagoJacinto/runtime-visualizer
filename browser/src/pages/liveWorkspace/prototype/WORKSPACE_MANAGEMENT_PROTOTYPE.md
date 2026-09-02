# Workspace-management prototype thread

## Decision

Choose where an operator manages workspace-wide concurrent runs without displacing the graph-first Procedure workspace.

## Fixed contract

Every candidate keeps the dark control-room system, scope identity and revision, graph/source panes, concurrent node markers, and the same 30-run scale condition. Only the workspace-management region changes.

## Incumbent

`workspace-activity-switcher` is provisional: a slim left icon rail replaces the adjacent scope rail with a scrollable active-run list. The operator chose it at medium confidence because a long run list must not live in a popover.

## Retired approaches

Header popover, activity-rail popover, and activity-rail drawer are retired. Do not restore, relabel, or use them as new candidates.

## Challenger gate

Before adding a candidate, record all three:

1. **Thesis:** the structural claim it tests against the incumbent.
2. **Scale witness:** how an operator reaches and scrolls 30 runs.
3. **Distinct region:** one of `secondary rail`, `source pane`, or `central workspace`.

A candidate is valid only when its distinct region differs from the incumbent's `secondary rail`. Styling, list copy, icon choice, or another overlay are not a new candidate.

## Next candidates

- `workspace-run-split-pane`: selecting Runs replaces the source pane with a scrollable run-management pane while the graph remains visible. Thesis: active execution management should share the Procedure workspace, not navigation.
- `workspace-run-board`: selecting Runs replaces the central workspace with a full-width run board and a clear return to the Procedure. Thesis: managing many runs deserves an explicit workspace mode.

Present one challenger per polar-zoom comparison. After feedback, update this file with the outcome before generating another candidate.
