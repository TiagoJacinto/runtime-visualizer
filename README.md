# Runtime Visualizer

Runtime Visualizer is a graph-first workspace for inspecting and running saved TypeScript Procedures directly in the browser.

## Development

```bash
bun install
bun run dev                 # browser app on localhost:5173
bun run dev:https            # browser app over private Tailscale HTTPS
```

The workspace uses the browser File System Access API. Open it in Chromium and select a project folder. File and revision data stay in the browser; analysis and execution run locally in Web Workers. HTTPS is required outside localhost. `bun run dev:https` starts Vite if needed, finds an unused Tailscale HTTPS listener starting at port 5191, creates a tailnet-only Serve route, verifies the URL, and prints it. If a listener already has a different route, the script leaves it untouched and tries the next port. Press Ctrl-C to stop; set `FRONTEND_PORT` or `TAILSCALE_HTTPS_PORT` to change the starting port.

## Validation

```bash
bun run test
bun run cibuild              # local CI-equivalent quality gate
bun run clone-check
```

See [`docs/testing.md`](docs/testing.md) for suite commands and quality-gate behavior.
