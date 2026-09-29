# Browser test system

## Test levels

- **Typical unit tests** exercise a browser-owned module through its public interface.
- **Typical integration tests** exercise browser adapters and their communication seams.
- **High-value acceptance tests** bind product examples to the browser application: HVUTs run with controlled collaborators; HVITs exercise a browser integration seam.

The browser Vitest configuration owns test discovery. Root scripts are the stable command interface:

```bash
bun run frontend:test:unit
bun run frontend:test:integration
bun run frontend:test:acceptance
bun run frontend:build
```

`bun run test` runs these suites, the Pi extension tests, lint, and the browser build. `bun run cibuild` runs the full local CI-equivalent quality gate.

## Gate routing

| Gate | Evidence | Command |
| --- | --- | --- |
| Change loop | Smallest affected browser suite | `bun run frontend:test:unit`, `bun run frontend:test:integration`, or `bun run frontend:test:acceptance` |
| Pre-commit | Oxlint checks staged browser source | Lefthook `lint-staged-source` |
| Pre-push | Browser lint, build, unit/integration/acceptance tests, clone check | `bun run prepush` |
| Pull request and scheduled CI | Lint, static checks, acceptance tests, and typical regression tests | Required **Quality policy** aggregate check |

`quality:static`, `quality:acceptance`, and `quality:regression` are the corresponding CI commands. `bun run quality` combines all three with lint.
