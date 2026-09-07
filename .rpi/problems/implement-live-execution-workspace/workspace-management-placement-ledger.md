# Workspace-management placement ledger

## Decision

- **Question:** Where should an operator reach workspace-wide active runs without weakening the graph-first Procedure workspace?
- **Axis:** 0% separates the control from the content it changes; 100% keeps the control adjacent to that content.
- **Constants:** dark control-room baseline; graph/source panes; revision controls; scope behavior; desktop viewport; 30 active runs.
- **Budget:** six pairwise comparisons; five were needed after adaptive challenges.
- **Rule:** active-run controls stay adjacent to a scrollable run list without leaving most of the workspace empty.
- **Incumbent:** **Context tabs** (`workspace-activity-tabs`).
- **Preferred interval:** current two-context secondary rail: `Scope` and `Runs`.
- **Behavior:** switching tabs replaces only rail content; the graph-and-source workspace remains visible and undisturbed.
- **Runs content:** one independently scrollable workspace-wide list ordered newest first; every row shows Procedure, file, revision, status, `View`, and `Cancel`. `View` selects the run’s file, Procedure, and revision in the graph-and-source workspace without changing the run. `Cancel` requires a second inline `Confirm cancel` action and never opens a modal. After confirmation, the row leaves Active Runs immediately and a brief notification confirms the cancellation request.
- **Confidence:** **high**.
- **Fallback:** `workspace-activity-inline` if additional contexts make the tab strip too crowded.
- **Largest uncertainty:** the context count and the crowding threshold are not yet known.

## Current prototype

Round 7 exposes only the confirmed placement and its explicit fallback:

- `workspace-activity-tabs` — **confirmed**: `Scope` and `Runs` sit directly above the controlled secondary-rail content.
- `workspace-activity-inline` — **active fallback**: runs occupy the upper part of the same rail while Procedure scope remains visible below.

The switcher passes the policy gate:

```text
ledger.py validate-visible ... --round 7 workspace-activity-tabs workspace-activity-inline
→ valid
```

## Tested pairs

| Round | Pair | Winner | Confidence | Decisive difference |
| ---: | --- | --- | --- | --- |
| 2 | Rail switcher vs drawer | Rail switcher | medium | A persistent rail scales better than a popover for 30 entries. |
| 3 | Rail switcher vs split | Rail switcher | medium | The split control was far from the controlled run list. |
| 4 | Inline run list vs Context tabs | Context tabs | low | Tabs keep the control adjacent; the result depended on future context count. |
| 5 | Context tabs vs Tabs with overflow (`v-d0683e8e607a`) | Context tabs | medium | Overflow adds vertical navigation; this UI should spend horizontal room rather than vertical room. |
| 6 | Context tabs vs Wide run rail (`v-c98c5217279b`) | Context tabs | high | The wide rail reduced vertical scrolling but consumed unnecessary horizontal space and reduced graph/source room. |

## Candidate lifecycle

- Rejected: header, activity-rail popover, drawer, board, split, Tabs with overflow (`v-d0683e8e607a`), and Wide run rail (`v-c98c5217279b`).
- Historical predecessor: Rail switcher (`workspace-activity-switcher`), no longer exposed by the prototype.
- Confirmed: Context tabs (`workspace-activity-tabs`).
- Fallback: Inline run list (`workspace-activity-inline`).

## Derivation tree

```text
Activity-rail popover
└── Rail switcher
    ├── Inline run list
    └── Context tabs
        ├── Tabs with overflow (`v-d0683e8e607a`) [rejected]
        └── Wide run rail (`v-c98c5217279b`) [rejected]
```

## Policy

- Current context count: **2** (`Scope`, `Runs`).
- Promotion: Context tabs are the selected placement at high confidence.
- Layout: preserve graph + source as the main workspace; do not use a popover, drawer, overflow menu, or wide multi-column rail.
- Trigger: if future contexts make the tab strip too crowded, switch to the inline fallback with runs above and Procedure scope below.
- Adding overflow navigation requires another design review.
- No next comparison is scheduled; revisit only when the context count changes.

## Recovery

After an unsuccessful candidate-replacement edit, the prototype was restored to the last known-good baseline before the wide-rail and overflow challengers were tested.
