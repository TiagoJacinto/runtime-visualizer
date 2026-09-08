# Test system

## Purpose

The test system gives an agent or developer the earliest reliable evidence for a change, then gives shared history one authoritative CI decision. Test level describes the subject and seam being exercised; `high-value` means the test implements an acceptance example, not that it is necessarily end-to-end.

## Test levels and command interface

Root commands are the stable interface. Package Vitest and Playwright configuration owns file selection and execution mechanics.

| Test type | Subject and evidence | Backend | Browser | Contracts |
| --- | --- | --- | --- | --- |
| Typical unit | A stateless or stateful module through its interface | `bun run backend:test:unit` | `bun run frontend:test:unit` | `bun run contracts:test:unit` |
| HVUT | A use case or application interface bound to an acceptance example, with controlled adapters | `bun run backend:test:hvut` | `bun run frontend:test:hvut` | — |
| Typical integration | Multiple modules or a real infrastructure adapter at one integration seam | `bun run backend:test:integration` | `bun run frontend:test:integration` | — |
| HVIT | An acceptance example at an integration seam | `bun run backend:test:hvit` | `bun run frontend:test:hvit` | — |
| Typical E2E | A technical path through a complete process or runtime | `bun run backend:test:e2e` | `bun run frontend:test:e2e` | — |
| Durable E2E | The real Bun process, SQLite, workers, and durable workspace behavior | `bun run backend:test:durable` | — | — |
| HVE2E | An acceptance example through the deployed-shaped system | `bun run backend:test:hve2e` | `bun run frontend:test:hve2e` | — |

The HVIT and backend HVE2E commands remain valid even when no files currently match them. They are explicit entry points for adding and running those test types. `bun run backend:test:acceptance` and `bun run frontend:test:acceptance` run each package's complete high-value acceptance suite.

## Gate routing

| Layer | Entry condition | Test evidence | Success signal | Failure action |
| --- | --- | --- | --- | --- |
| Change loop | A developer or agent changes behavior | Run the smallest affected command from the table above | Selected suite exits `0` | Fix the named failing test before broadening scope |
| Pre-commit | A local commit includes staged production source under `backend/src` or `browser/src` | Oxlint validates only the staged source files through `bun run lint:files -- <files>` | Lefthook's `lint-staged-source` command exits `0` without changing tracked files | Fix the named lint violation, restage the file, and recommit |
| Pre-push | A local push begins through Lefthook | Backend unit and durable E2E tests, backend HVUT/HVIT/HVE2E acceptance tests, and browser HVUTs | `bun run prepush` exits `0` without changing tracked files | Run `bun run prepush`, fix its first failure, rerun |
| Pull-request CI | A pull request is opened or updated | Lint, static checks, backend and browser HVUTs, and browser HVE2E run in parallel | Required **Quality policy** aggregate check passes | Reproduce with `bun run quality:acceptance` or `bun run frontend:test:hve2e` |
| Main-branch and nightly CI | A commit reaches `main` or the 03:17 UTC schedule runs | Pull-request evidence plus typical unit/integration/durable regression tests, contracts tests, and coverage policy | **Quality policy** passes | Repair through a pull request; do not weaken the gate |

Backend integration stays out of pre-push because it is the slowest typical suite; it runs only on `main` and nightly CI. Browser HVE2E remains mandatory in pull-request CI. The durable E2E remains pre-push because it exercises otherwise uncovered Bun/SQLite/worker behavior in about four seconds. Backend HVIT and HVE2E commands are retained in the pre-push acceptance aggregate; they currently have no matching test files and therefore complete immediately.

## Authority and continuation

- `package.json` owns the root command interface and gate composition. `bun run test` runs the backend unit/integration/durable suites, backend HVUT/HVIT/HVE2E suites, browser HVUT/HVIT/HVE2E suites, and contracts unit tests, in addition to static checks. Pull-request CI uses `quality:static`, `quality:acceptance`, and `frontend:test:hve2e`. Main-branch and nightly CI additionally use `quality:regression` and `quality:coverage`.
- `backend/vitest.config.ts`, `browser/vitest.config.ts`, and `browser/playwright.config.ts` own suite-to-file binding.
- `quality/coverage-policy.mjs` owns required CI suites, coverage evidence, and justified exclusions. Its required-suite list currently records only suite families with committed test files; empty HVIT/HVE2E commands are still invoked by `bun run test` and remain runnable.
- `lefthook.yml` owns staged-source pre-commit lint and local pre-push invocation; `.github/workflows/quality-gates.yml` owns shared enforcement.
- A new test type or renamed command is complete only when its package command, root command, runner project, applicable gate, coverage policy, and this document agree. Remove a test type only when all of those references and its tests are removed together.
