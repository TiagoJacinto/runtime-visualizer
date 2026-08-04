---
target: main screen
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-04T10-27-02Z
slug: rc-components-generated-liveprocedureworkspace-tsx
---
Method: degraded single-context. No sub-agent tool was exposed in this session, so Assessment A and Assessment B ran sequentially in one context.

## Design Health Score

| # | Heuristic | Score | Key Issue |
| --- | ----------- | ------- | ----------- |
| 1 | Visibility of System Status | 3/4 | Queue, connection, run, node, and revision state are visible. Several controls give no result feedback. |
| 2 | Match System / Real World | 3/4 | The graph and runtime terms fit the Operator. Some technical terms have no inline explanation. |
| 3 | User Control and Freedom | 2/4 | Dismiss, drawer close, import toggle, and run selection work. There is no cancel or undo path for a run. |
| 4 | Consistency and Standards | 3/4 | The visual system is cohesive. Small text and multicolor run markers weaken the shared signal system. |
| 5 | Error Prevention | 2/4 | Selectors constrain file and Procedure choices. Run, graph, settings, and copy affordances are not fully wired. |
| 6 | Recognition Rather Than Recall | 3/4 | Breadcrumbs, labels, statuses, and graph nodes expose most context. Icon-only actions lack visible tooltips. |
| 7 | Flexibility and Efficiency | 2/4 | The UI shows a `⌘↵` shortcut, but it is not implemented. There are no keyboard accelerators for graph work. |
| 8 | Aesthetic and Minimalist Design | 3/4 | The canvas is calm and focused. The queue banner and three-region shell compete with the graph on arrival. |
| 9 | Error Recovery | 2/4 | Diagnostics explains graph state. A failed run has no visible cause, retry action, or recovery path. |
| 10 | Help and Documentation | 1/4 | There is no contextual help for Procedures, revisions, graph controls, or run states. |
| **Total** | | **24/40** | **Acceptable. Improve task completion and legibility before release.** |

## Design Specificity Verdict

**LLM assessment:** Strongly authored for Runtime Visualizer. The green-black control-room canvas, emerald live signals, source-plus-graph framing, revision banner, run markers, and graph-node language could not be copied unchanged into a generic admin tool without losing their meaning. The system has a clear point of view. Its main weakness is not identity. It is that several visual affordances promise more behavior than the current screen supplies.

**Deterministic scan:** The CLI detector returned `[]` for `browser/src/components/generated/LiveProcedureWorkspace.tsx`.

**Browser evidence:** Injection succeeded in a custom headless browser tab with the title `[Human] Runtime Visualizer`. The browser detector reported 57 anti-patterns and produced an overlay screenshot. No persistent user-visible `[Human]` tab was available in this harness. The strongest findings were `undersized functional text`, `low contrast text`, `tiny body text`, `overused font`, `line length too long`, `nested cards`, and `hairline border with wide shadow`.

Some browser findings are false positives or intentional: nested graph nodes are valid domain objects, Inter is intentionally the primary UI font, and colored run markers distinguish concurrent runs. The low-contrast metadata, very small labels, and non-functional-looking controls are real review targets.

## Overall Impression

This is a convincing runtime control room with a clear visual hierarchy and a strong graph focus. The single biggest opportunity is to make the screen honest and legible: every visible control must work or disappear, and machine metadata must remain readable at normal zoom.

## What's Working

1. **Product-specific visual language.** Green-black layers, emerald live state, and IBM Plex Mono metadata create a distinct runtime-inspection identity.
2. **System status is unusually visible.** The queue banner, connected chip, selected run, current node, revision, and graph marker all keep execution context in view.
3. **Responsive graph composition.** The mobile graph now stacks branch nodes instead of squeezing them into unreadable columns, with no horizontal overflow at 390px.

## Priority Issues

### [P1] Visible controls imply behavior that does not exist

- **What:** Search graph, Fit graph, Workspace settings, Copy source, and the `⌘↵` Run Procedure hint are visible but do not complete their implied actions.
- **Why it matters:** Operators depend on tool affordances. A click with no feedback breaks trust and removes the power-user path.
- **Fix:** Wire each action to a real state or remove it. Implement the shortcut before displaying it. Add a small success state for copy and a disabled/loading state for graph actions.
- **Suggested command:** `/impeccable harden`

### [P1] Runtime metadata is too small and too dim

- **What:** The detector found repeated `undersized functional text`, `tiny body text`, and `low contrast text`. Run timestamps, node details, revision text, event stream text, and field labels use 8–10px muted colors.
- **Why it matters:** Operators inspect this information during debugging. Low-contrast metadata is easy to miss and fails first for low-vision users and zoomed layouts.
- **Fix:** Set interactive and status text to at least 12px. Keep supporting text at 11–12px with a brighter hue-tinted neutral. Reserve 8–9px mono for non-essential eyebrow labels only.
- **Suggested command:** `/impeccable typeset`

### [P1] Mobile primary action is hidden in the navigation drawer

- **What:** On a 390px viewport, `Run Procedure` is inside the off-canvas left rail. The main graph has no persistent run action after the drawer closes.
- **Why it matters:** Casey must reach to the top, open the drawer, act, and close it. The most important action is outside the main thumb-friendly work area.
- **Fix:** Keep the rail for file and Procedure selection, but add a compact Run action to the main header or a bottom action bar on mobile. Preserve one primary action only.
- **Suggested command:** `/impeccable adapt`

### [P2] Failed runs do not explain recovery

- **What:** `Run 04` shows `failed` and a node name, but no failure reason, event detail, retry action, or link to the relevant diagnostic.
- **Why it matters:** A visible failure without a next step leaves the Operator at the most important decision point.
- **Fix:** Selecting a failed run should open a run detail state with the failure message, source location, last event, and `Retry` or `Open diagnostics` action.
- **Suggested command:** `/impeccable clarify`

### [P2] The queue banner has dismissal but no clear update path

- **What:** `Update queued` explains that the graph is pinned, but `Dismiss` only hides the warning. The user cannot apply or inspect the queued revision from this surface.
- **Why it matters:** Dismissal reduces visibility without resolving the underlying state. The Operator may forget that the graph is stale.
- **Fix:** Add `Review revision` or `Apply when runs finish` as the primary banner action. Keep `Dismiss` secondary and repeat stale status in the graph header until resolved.
- **Suggested command:** `/impeccable clarify`

## Cognitive Load Assessment

**Result: 2 failed checklist items; moderate load.**

- **Failed — Single focus:** The graph competes with the queue warning, run history, and run inspector on first arrival.
- **Failed — One thing at a time:** The screen presents file choice, Procedure choice, run history, import visibility, view mode, diagnostics, graph search, graph fit, and revision state together.
- **Pass — Chunking:** The run list and top controls are grouped into small sets.
- **Pass — Grouping:** Navigation, graph, source, and run detail have clear regions.
- **Pass — Visual hierarchy:** The selected Procedure and graph remain the main visual focus.
- **Pass — Minimal choices:** Most decision points expose three or fewer file or Procedure options.
- **Pass — Working memory:** File, Procedure, revision, and current node stay visible.
- **Pass — Progressive disclosure:** Source view and diagnostics are optional disclosures.

## Emotional Journey

- **Arrival:** The dark control-room canvas feels credible and focused, but the amber queue banner creates immediate uncertainty before the Operator reaches the graph.
- **Working state:** The active node, run marker, connected chip, and event stream provide strong reassurance that the system is alive.
- **Peak:** The highlighted `validate_input` node makes execution legible at a glance.
- **End state:** `complete` communicates a terminal node, but the screen does not explicitly confirm a successful run. A failed run also stops at status without recovery.

## Persona Red Flags

### Alex (Impatient Power User)

- The `⌘↵` hint advertises a shortcut that is not implemented.
- Search graph, Fit graph, and Settings look like power tools but do nothing.
- Selecting a run is possible, but there are no keyboard shortcuts for changing runs or focusing the graph.

### Sam (Accessibility-Dependent User)

- Many labels and runtime values are 8–10px and use dim slate colors. The browser detector flagged this repeatedly.
- Status uses text and icons in most places, but run marker identity is still primarily color plus a tiny number.
- Some controls now have visible focus styles, but Copy source, the diagnostics close button, and several drawer actions still rely on hover color.
- Run creation and graph state changes have no live-region announcement.

### Casey (Distracted Mobile User)

- The main Run Procedure action sits inside the top off-canvas drawer, outside the main work area after the drawer closes.
- The graph itself fits without horizontal overflow after branch stacking. This is a positive result.
- The queue banner occupies the first content area and can be dismissed, but its stale state has no persistent compact indicator in the main graph header.

## Minor Observations

- The document title is still the generic `runtime-visualizer`, not the product name shown in the header.
- `prepare`, `validate_input`, and `prepare_payload` preserve code identifiers well, but user-facing labels could pair the identifier with a readable description.
- The diagnostics button is visible on desktop and hidden in the main toolbar on mobile, which is correct only if the header terminal button remains discoverable.
- The browser detector's `hairline border with wide shadow` finding is partly intentional for graph nodes, but the shadow can be reduced on ordinary panels.

## Questions to Consider

1. Which should come first: honest working controls, readable metadata, or failed-run recovery?
2. Should mobile keep Run Procedure in the navigation rail, or move it to the main header or bottom action bar?
3. Should the next pass optimize for expert Operators with shortcuts, or first-time Operators with contextual help?
