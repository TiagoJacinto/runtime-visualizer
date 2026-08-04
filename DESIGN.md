---
name: Runtime Visualizer
description: Dark live workspace for inspecting TypeScript procedures and runtime flow.
colors:
  ink: "#07110E"
  surface: "#091510"
  sidebar: "#0A1712"
  diagnostic-surface: "#0B1713"
  graph-node: "#0E1D18"
  active-node: "#122A21"
  signal: "#6EE7B7"
  signal-soft: "#A7F3D0"
  signal-muted: "rgba(110, 231, 183, 0.10)"
  warning: "#FCD34D"
  info: "#7DD3FC"
  danger: "#FDA4AF"
  text-strong: "#FFFFFF"
  text: "#CBD5E1"
  text-muted: "#94A3B8"
  text-dim: "#64748B"
  hairline: "rgba(255, 255, 255, 0.10)"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "9px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.16em"
  code:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  input-select:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  graph-node:
    backgroundColor: "{colors.graph-node}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.lg}"
    padding: "14px 16px"
  status-chip:
    backgroundColor: "{colors.signal-muted}"
    textColor: "{colors.signal-soft}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
---

# Design System: Runtime Visualizer

## Overview

**Creative North Star: "The Live Control Room"**

This interface treats runtime inspection as a calm control room. A green-black canvas holds layered graphite-green panels. Small emerald signals show connection, execution, and active graph state. The visual system is compact because the Operator needs to scan code, graph structure, and run state at the same time.

The incumbent system uses a quiet technical voice: Inter carries readable interface text, while IBM Plex Mono marks source, revisions, event times, and other machine-facing values. Hairline borders and tonal changes separate regions. Shadows stay local to graph nodes and drawers. No confirmed visual rejection exists; this record documents the visual language already present in the code.

**Key Characteristics:**

- Green-black operational canvas with layered surfaces.
- Emerald signal color reserved for active and connected states.
- Dense two-font system: Inter for UI, IBM Plex Mono for runtime detail.
- Hairline borders, compact controls, and generous graph breathing room.
- Responsive workspace with a collapsible navigation rail and contextual run panel.

## Colors

The palette is a deep green-black neutral field with one cool emerald signal and small semantic accents for warnings, failures, and active information.

### Primary

- **Live Emerald** (`{colors.signal}`): Primary action, active graph node, connected state, and execution signal.
- **Soft Emerald** (`{colors.signal-soft}`): Text and supporting emphasis paired with the live signal.

### Secondary

- **Queue Amber** (`{colors.warning}`): Deferred refresh, filesystem changes, and caution states.
- **Trace Sky** (`{colors.info}`): Running status in the run inspector.

### Tertiary

- **Failure Rose** (`{colors.danger}`): Failed run status and failure emphasis.

### Neutral

- **Ink Canvas** (`{colors.ink}`): Main application background and code surface.
- **Panel Green** (`{colors.surface}`): Header, graph, source, and dialog surfaces.
- **Sidebar Green** (`{colors.sidebar}`): Navigation and run history rail.
- **Diagnostic Green** (`{colors.diagnostic-surface}`): Diagnostics drawer surface.
- **Graph Green** (`{colors.graph-node}`): Resting graph node surface.
- **Active Graph Green** (`{colors.active-node}`): Active graph node surface.
- **Strong Text** (`{colors.text-strong}`): Titles and high-priority labels.
- **Body Text** (`{colors.text}`): Readable interface and source support text.
- **Muted Text** (`{colors.text-muted}`): Secondary labels and controls.
- **Dim Text** (`{colors.text-dim}`): Metadata, timestamps, and low-priority detail.
- **Hairline** (`{colors.hairline}`): Panel, control, and divider borders.

**The Signal Scarcity Rule.** Use Live Emerald for state and action. Do not turn every label or border emerald. The signal must identify what is live now.

## Typography

**Display Font:** Inter (with sans-serif)
**Body Font:** Inter (with sans-serif)
**Label/Mono Font:** IBM Plex Mono (with monospace)

**Character:** Inter keeps the dense workspace readable and neutral. IBM Plex Mono gives source and runtime metadata a precise instrument-panel voice without turning the whole interface into code.

### Hierarchy

- **Display** (600, 18px, 1.2 line-height, -0.025em): Selected Procedure name and primary workspace heading.
- **Headline** (600, 12px, 1.4 line-height): Section titles, product name, and key status labels.
- **Title** (500, 11px, 1.4 line-height): Run names, graph node labels, and compact controls.
- **Body** (400, 10px, 1.6 line-height): Supporting descriptions, diagnostics, and event details.
- **Label** (500, 9px, 1.4 line-height, 0.16em tracking): Uppercase field labels and panel eyebrows.
- **Code** (400, 10px, 1.5 line-height): Source text, paths, revisions, nodes, and event timestamps.

**The Two-Voice Rule.** Use Inter for actions and interpretation. Use IBM Plex Mono for values that describe code, time, identity, or revision.

## Layout

The workspace uses a full-height three-region shell: a 268px navigation rail on the left, a flexible central work area, and a 250px run inspector on wide screens. A 56px top bar anchors the product identity and the current file/procedure breadcrumb. The central area keeps the graph as the visual focus and gives it a minimum 430px working height.

The central work area uses 16px outer padding on small screens and 24px on larger screens. Panels use 12px gaps. The source view changes the central area to a source-plus-graph split at the `xl` breakpoint. The navigation rail becomes an off-canvas drawer below the `lg` breakpoint. The run inspector is hidden below 1180px so the graph keeps usable width. Controls wrap instead of becoming horizontally clipped.

## Elevation & Depth

This is a tonal-layered system, not a floating-card system. Depth comes first from the sequence of ink canvas, panel green, sidebar green, and graph green. Borders are low-opacity white hairlines. A strong local shadow is reserved for graph nodes and a drawer overlay. Backdrop blur appears only behind graph controls and the diagnostics scrim.

### Shadow Vocabulary

- **Graph node lift** (`shadow-xl`, black at 20%): Separates a graph node from the dotted graph field.
- **Drawer lift** (`shadow-2xl`): Separates the diagnostics drawer from the dimmed workspace.

**The Local Lift Rule.** Do not add shadows to every panel. Use tonal layering for structure and shadows only when a surface must sit above active work.

## Shapes

The form language uses gently rounded rectangles. Compact controls and buttons use 8px corners. Larger panels and graph nodes use 12px corners. Status indicators use a full pill. Controls keep a 1px hairline border at rest and shift to an emerald border or focus ring when active. The system has no sharp card corners and no ornamental geometric shapes beyond small status dots and the graph's dotted field.

## Components

### Buttons

- **Shape:** Compact rounded rectangles (8px).
- **Primary:** Live Emerald fill, Ink Canvas text, 10px vertical and 16px horizontal padding.
- **Hover / Focus:** Move from Live Emerald to Soft Emerald. Use a visible emerald focus ring with the panel background as the offset. Pressed state moves down by 1px.
- **Quiet / Icon:** Use a hairline border or transparent surface with muted text. Icon-only buttons remain 32px square and require an accessible label.

### Inputs / Fields

- **Style:** Ink Canvas fill, hairline border, 8px corners, 10px vertical and 12px horizontal padding.
- **Focus:** Shift the border toward emerald and add a low-opacity emerald ring.
- **Error / Disabled:** Use semantic failure or warning color with an icon or text. Do not rely on color alone.

### Cards / Containers

- **Corner Style:** 12px for panels and graph nodes.
- **Background:** Panel Green for work surfaces, Sidebar Green for navigation, Graph Green for resting nodes.
- **Shadow Strategy:** Follow the Local Lift Rule. Graph nodes may use `shadow-xl`; ordinary panels stay tonal and flat.
- **Border:** 1px Hairline border.
- **Internal Padding:** 12px for compact controls; 16px for panels; 20px for a drawer.

### Navigation

- **Style:** A 268px dark green rail with a 56px product bar above the workspace.
- **Default / Hover / Active:** Muted labels at rest; white text on hover; a lightly raised translucent surface for the selected run. The primary action is the only solid emerald control.
- **Mobile treatment:** The rail becomes an off-canvas drawer with a dimmed overlay and an explicit menu button.

### Graph Nodes

- **Style:** A maximum 250px node with Graph Green surface, hairline border, 12px corners, 16px horizontal padding, and a small status dot.
- **Active:** Active Graph Green surface and emerald border signal the current execution node.
- **Markers:** Run markers are small numbered colored circles with accessible labels. They sit above the node without changing graph geometry.

### Status Chips

- **Style:** Full-pill emerald tint with Soft Emerald text for connected state. Running, failed, and queued states use Sky, Rose, and Amber as semantic alternatives.
- **Behavior:** Pair icons with text. Status is never communicated by color alone.

## Do's and Don'ts

### Do

- **Do** keep the green-black canvas and layered surfaces as the visual base.
- **Do** reserve emerald for action and live state.
- **Do** use IBM Plex Mono for source, revisions, paths, nodes, and event times.
- **Do** keep borders subtle and use tonal contrast before shadow.
- **Do** keep graph controls close to the graph and make icon-only controls accessible.
- **Do** preserve the responsive shell: off-canvas navigation and a hidden narrow-screen run inspector.

### Don't

- **Don't** introduce bright rainbow accents for ordinary interface decoration.
- **Don't** use large marketing-style display type inside the operational workspace.
- **Don't** make every surface float with a shadow or gradient.
- **Don't** hide run, error, or connection state behind color without text or an icon.
- **Don't** flatten source and graph into one undifferentiated panel.
- **Don't** replace the compact control-room density with oversized cards or loose dashboard tiles.
