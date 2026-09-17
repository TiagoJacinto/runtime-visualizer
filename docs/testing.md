# Test system

## Purpose

The test system gives an agent or developer the earliest reliable evidence for a change, then gives shared history one authoritative CI decision. Test level describes the subject and seam being exercised; `high-value` means the test implements an acceptance example, not that it is necessarily end-to-end.

## Test levels and command interface

Root commands are the stable interface. Package Vitest and Playwright configuration owns file selection and execution mechanics.

| Test type | Subject and evidence | Backend | Browser | Contracts |
| --- | --- | --- | --- | --- |
| Typical unit | A stateless or stateful module through its interface | `bun run backend:test:unit` | `bun run frontend:test:unit` | `bun run contracts:test:unit` |
| HVUT | A use case or application interface bound to an acceptance example, with controlled adapters | `bun run backend:test:hvut` | `bun run frontend:test:hvut` | — |
| Typical integration | An incoming or outgoing adapter exercised through its real communication mechanism | `bun run backend:test:integration` | `bun run frontend:test:integration` | — |
| HVIT | An acceptance example at an integration seam | `bun run backend:test:hvit` | `bun run frontend:test:hvit` | — |
| Typical E2E | A technical path through a complete process or runtime | `bun run backend:test:e2e` | `bun run frontend:test:e2e` | — |
| Durable E2E | The real Bun process, SQLite, workers, and durable workspace behavior | `bun run backend:test:durable` | — | — |
| HVE2E | An acceptance example through the deployed-shaped system | `bun run backend:test:hve2e` | `bun run frontend:test:hve2e` | — |

The HVIT and backend HVE2E commands remain valid even when no files currently match them. They are explicit entry points for adding and running those test types. `bun run backend:test:acceptance` and `bun run frontend:test:acceptance` run each package's complete high-value acceptance suite.

## Integration-test directions

Classify an integration test from the application core's perspective. Integration tests exercise either an incoming adapter or an outgoing adapter through a real communication mechanism. Merely constructing platform values such as `Request`, `Response`, `Headers`, or `ReadableStream` around an injected function does not create an integration test; that remains an isolated adapter unit test.

### Incoming adapter integration tests

An incoming adapter translates an external stimulus into an application-layer operation. Exercise the real incoming mechanism and replace the invoked use case or application API with a stub or mock because use-case behavior belongs in HVUTs. Verify that the adapter parses the input, calls the correct operation with the correct values, and translates the application response back through the mechanism.

Backend examples include making a real HTTP request against the configured server, sending a GraphQL operation, or delivering a webhook while stubbing the called use case. Prefer the framework's in-process request facility when it traverses the real router, middleware, validation, and handler stack; use a socket only when socket behavior is itself relevant.

Frontend incoming integration tests are possible because the UI is an incoming adapter. Mount the real React component in a browser, provide a `WorkspaceController` spy, perform a real DOM interaction, and verify the application operation:

```tsx
render(<LiveWorkspacePage controller={controllerSpy} />)

await page.getByRole("button", { name: "Run Procedure" }).click()

// communication verification
expect(controllerSpy.runProcedure).toHaveBeenCalledOnce()
```

This tests browser event → React handler → application port. It does not test `runProcedure` behavior, TanStack Query, or the backend. A router integration can similarly perform a real navigation and verify that the routed page invokes the expected application operation.

### Outgoing adapter integration tests

An outgoing adapter translates an application request into communication with a dependency. Direction is determined by who owns the port, not by the direction in which bytes happen to move. For example, an SSE client is an outgoing adapter because the application opens the subscription through a required port, even though events subsequently arrive from the server.

Choose one of these forms according to dependency ownership:

#### Managed dependency contract tests

A managed dependency is owned entirely by this application and has a one-to-one lifecycle with it, such as its private database. Define one reusable contract suite from the application's outgoing port and run it against every implementation, including the real adapter and in-memory test adapters. The suite proves that all implementations honor the same operations, results, errors, and state semantics.

Use the real managed dependency for the concrete adapter: for example, a temporary database with production migrations. Reset its state between tests. Do not mock the dependency protocol inside the concrete-adapter run, because that would stop proving the implementation satisfies the port contract.

#### Unmanaged dependency integration tests

An unmanaged dependency is not owned exclusively by this application, such as an external API or shared queue. Exercise the outgoing adapter against, in descending preference according to feasibility:

1. The real service under a dedicated test account.
2. A sandbox supplied by the provider.
3. A protocol-faithful fake server or containerized installation.

Verify requests, authentication, serialization, provider responses, errors, and retry-relevant behavior at the adapter boundary. Keep these tests focused on compatibility with the external protocol; application decisions made from adapter results belong in HVUTs.

## Gate routing

| Layer | Entry condition | Test evidence | Success signal | Failure action |
| --- | --- | --- | --- | --- |
| Change loop | A developer or agent changes behavior | Run the smallest affected command from the table above | Selected suite exits `0` | Fix the named failing test before broadening scope |
| Pre-commit | A local commit includes staged production source under `backend/src` or `browser/src` | Oxlint validates only the staged source files through `bun run lint:files -- <files>` | Lefthook's `lint-staged-source` command exits `0` without changing tracked files | Fix the named lint violation, restage the file, and recommit |
| Pre-push | A local push begins through Lefthook | Backend unit and durable E2E tests, backend HVUT/HVIT/HVE2E acceptance tests, browser typical units, and browser HVUTs | `bun run prepush` exits `0` without changing tracked files | Run `bun run prepush`, fix its first failure, rerun |
| Pull-request CI | A pull request is opened or updated | Lint, static checks, backend and browser HVUTs, and browser HVE2E run in parallel | Required **Quality policy** aggregate check passes | Reproduce with `bun run quality:acceptance` or `bun run frontend:test:hve2e` |
| Main-branch and nightly CI | A commit reaches `main` or the 03:17 UTC schedule runs | Pull-request evidence plus typical unit/integration/durable regression tests, contracts tests, and coverage policy | **Quality policy** passes | Repair through a pull request; do not weaken the gate |

Backend integration stays out of pre-push because it is the slowest typical suite; it runs only on `main` and nightly CI. Browser HVE2E remains mandatory in pull-request CI. The durable E2E remains pre-push because it exercises otherwise uncovered Bun/SQLite/worker behavior in about four seconds. Backend HVIT and HVE2E commands are retained in the pre-push acceptance aggregate; they currently have no matching test files and therefore complete immediately.

## Authority and continuation

- `package.json` owns the root command interface and gate composition. `bun run test` runs the backend unit/integration/durable suites, backend HVUT/HVIT/HVE2E suites, browser typical units, browser HVUT/HVIT/HVE2E suites, and contracts unit tests, in addition to static checks. Pull-request CI uses `quality:static`, `quality:acceptance`, and `frontend:test:hve2e`. Main-branch and nightly CI additionally use `quality:regression` and `quality:coverage`.
- `backend/vitest.config.ts`, `browser/vitest.config.ts`, and `browser/playwright.config.ts` own suite-to-file binding.
- `quality/coverage-policy.mjs` owns required CI suites, coverage evidence, and justified exclusions. Its required-suite list currently records only suite families with committed test files; empty HVIT/HVE2E commands are still invoked by `bun run test` and remain runnable.
- `lefthook.yml` owns staged-source pre-commit lint and local pre-push invocation; `.github/workflows/quality-gates.yml` owns shared enforcement.
- A new test type or renamed command is complete only when its package command, root command, runner project, applicable gate, coverage policy, and this document agree. Remove a test type only when all of those references and its tests are removed together.
