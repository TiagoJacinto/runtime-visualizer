---
type: design-prd
---

# Browser-Managed Source Files

## Problem to Solve

The runtime visualizer currently depends on a backend to discover and provide source files to the browser. Users need to add projects by selecting a folder and have the browser workspace work directly with those files, without depending on a backend for file access.

## What does business success look like, and how can we measure it?

Measure the share of supported folder selections that successfully open as usable projects in the workspace. A successful import makes the project’s `.ts` and `.tsx` files available in a navigable file tree without backend file discovery or source-reading requests; changes made outside the visualizer appear automatically. Target: at least 95% successful imports in supported environments.

## Proposed Solution

Users add projects by selecting a folder in the browser. The workspace uses the selected project’s files directly, without backend file discovery or source-reading. Existing user-facing workspace capabilities—including analysis, revision history, and execution—remain in scope; how they work without a backend is deferred to TDD.

## Solution Details

#### First-time users start by selecting a project folder

When no project is available, show a focused welcome screen with a single “Select project folder” action and a brief explanation of supported source files. Users can add more projects after opening the workspace.

```task-artifact
.rpi/problems/remove-backend-and-use-browser-files-api/mockup-first-project.html
```

#### Users switch projects from the workspace rail without losing their place

A user selects a project folder and opens it in the workspace. Multiple imported projects remain available so the user can switch between them without importing each time. The project list is remembered across visits; the workspace reopens a project when browser access is available and asks the user to select its folder again if access is unavailable. A project switcher in the context rail lists saved projects and provides an “Add project folder” action, letting users switch without leaving the workspace. Existing analysis, revision-history, and execution workflows remain in scope rather than being dropped as a side effect of changing file access.

#### The file tree mirrors folders and lists visualizable source files

The selected project’s nested folder structure appears as a file tree in the context rail. The tree lists `.ts` and `.tsx` files, which users can select to view their source and related workspace information. This replaces the flat file selector; non-source files are not listed.

```task-artifact
.rpi/problems/remove-backend-and-use-browser-files-api/mockup-project-file-tree.html
```

#### Projects without supported source files remain available with clear guidance

If an imported project has no `.ts` or `.tsx` files, keep it in the saved project list and show an empty state explaining that the workspace supports those file types. The user can add source files to the folder and they appear automatically, or switch to another saved project.

```task-artifact
.rpi/problems/remove-backend-and-use-browser-files-api/mockup-empty-source-project.html
```

#### External file changes update the open workspace automatically

While a project is open, changes made to its files outside the visualizer are detected automatically. The file tree and displayed source update, and affected analysis and revision data refresh without requiring the user to reload or re-import the project.

```task-artifact
.rpi/problems/remove-backend-and-use-browser-files-api/mockup-auto-file-updates.html
```

## Alternative Solutions Considered

- **Empty workspace shell for first-time users** — Adds project and file-navigation controls before there is a project to show; the focused welcome screen is simpler.
- **Flat file selector** — Does not expose the folder hierarchy of an imported project.
- **List every project file** — Adds files the workspace cannot currently visualize; the tree stays focused on `.ts` and `.tsx` source files.
- **Reject folders without supported source files** — Prevents users from keeping a project in the list before its source files are available.

## Deferred to TDD

- Determine how existing analysis, revision-history, and execution workflows can be preserved without the backend.
- Determine how the browser remembers project folders and restores access across visits.
- Determine how external file changes are detected and how affected workspace data is refreshed without the backend.
- Evaluate a file-tree component library, including `trees.software`.
