# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Development commands

The default development command starts the Vite frontend and Fastify server together:

```bash
bun install
bun run dev                 # frontend (:5173) + server (:3000)
```

Run either side independently when needed:

```bash
bun run dev:frontend        # frontend only
bun run dev:server          # server only
bun run start:server        # server without hot reload
```

Build, lint, typecheck, and test commands use explicit frontend/server suffixes:

```bash
bun run build               # frontend build + server typecheck
bun run build:frontend
bun run build:server
bun run lint:frontend
bun run test:frontend
bun run test:browser:frontend
bun run test:server
bun run typecheck:server
```

A small Fastify server lives in `./server` (declared as a workspace).

Endpoints:

- `GET  /api/health` — liveness probe (`{ status, uptimeMs, timestamp }`).
- `GET  /api/runtime` — node + bun version, platform, arch, pid, memory snapshot.
- `GET  /api/runtime/memory` — rss / heap / external memory usage.
- `GET  /api/runtime/uptime` — process uptime in milliseconds.
- `POST /api/echo` — echoes the JSON body back, useful for round-trip checks.
- `GET  /api/files` — list every file under the folder configured in `settings.json`
  (`filesFolder`), returned as forward-slash paths relative to that folder.

The server is built with TypeScript and exercised by `bun test` in `server/test/`.

### `settings.json`

A small JSON file at the project root configures server-wide options. Currently:

```json
{ "filesFolder": "./target" }
```

`filesFolder` is resolved relative to the directory holding `settings.json` (the
server walks up from its own location to find it). Defaults to `./target` when the
file is missing or has no `filesFolder` key. The endpoint `GET /api/files` returns
a JSON array of every regular file under that folder, recursive, in deterministic
order (subdirectory contents first, then sibling files, alphabetic within each
group). Symbolic links are skipped. Missing configured folder → `[]`.

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
