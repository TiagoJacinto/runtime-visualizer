---
type: research-questions
---

# Research Questions

1. How does the browser application currently discover, select, and load source files, and which frontend modules consume the resulting file paths and contents?
2. How do the backend source-file listing and reading paths work today, including their supported file types, directory traversal rules, path-safety checks, and error behavior?
3. How do file changes propagate through the current system to workspace state, analysis/revision history, and the user interface?
4. How do analysis, execution, and revision-history flows obtain source files and their dependencies, and what contracts connect those flows to browser-side code?
5. What browser file APIs or related libraries are currently used, if any, and what permissions, persistence, browser-support, and directory/file-handle behaviors are relevant to the existing application context?
6. What design system or component library is used in the browser workspace, and what current patterns define its colors (including hex values), typography, spacing, borders, shadows, and theming?

## Findings

- The browser's `AnalysisGateway.listFiles()` requests `GET /api/files`, filters the response to `.ts` and `.tsx` paths, and also provides analysis and revision-history operations. (`browser/src/shared/api/analysis-gateway.ts:45-57`)
- The backend `GET /api/files` route delegates to `listSourceFiles`; traversal returns sorted relative paths for regular files, skips symlinks and dot-prefixed directories, and treats missing subtrees as empty. (`backend/src/modules/source/useCases/listFiles/files.ts:13-17`; `backend/src/modules/source/useCases/listFiles/list-files.ts:7-18,56-59`)
- Backend source reads validate that requested paths stay inside the configured folder, resolve real paths, reject symlink/non-file targets, and return source text with a SHA-256 revision. (`backend/src/modules/source/useCases/readSource/read-source.ts:12-42,54-94`)
- The Fastify app derives its file root from `AppOptions.filesFolder` or loaded settings and registers file-list, source/procedure, analysis, CFG, execution, and server-sent-events routes. (`backend/src/shared/infra/http/app.ts:61-62,97-98,174-192`)
- `SourceChangeWatcher` polls the configured folder at a default 250 ms interval and detects added, modified, and deleted source files; the events route publishes source changes to the workspace event hub. (`backend/src/modules/source/useCases/observeChanges/change-watcher.ts:21-39,56-98`; `backend/src/modules/source/useCases/observeChanges/events.ts:49-57`)
- Browser styling uses Tailwind CSS and CSS custom properties; its base palette includes `#07110e` background and `#6ee7b7` primary, with Inter and IBM Plex Mono font families. (`browser/src/index.css:1-4,8-28,43-57,94-99`)

## Key Context Pointers

- Filepaths: `.rpi/problems/remove-backend-and-use-browser-files-api/`
- Libraries and dependencies: `browser's files API`
