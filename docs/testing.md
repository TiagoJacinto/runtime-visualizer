# Test system

## Purpose

The test system gives an agent or developer the earliest reliable evidence for a change, then gives shared history one authoritative CI decision. Test level describes the subject and seam being exercised; `high-value` means the test implements an acceptance example, not that it is necessarily end-to-end.

## Test taxonomy and command interface

Test types form a hierarchy rather than a flat list:

- **Typical tests** provide technical regression evidence.
  - **Unit tests** exercise a stateless or stateful module through its interface.
  - **Integration tests** exercise an adapter through a real communication mechanism.
    - **Incoming integration tests** exercise an adapter that translates an external stimulus into an application operation.
    - **Outgoing integration tests** exercise an adapter that communicates through an application-owned port.
      - **Managed-dependency contract tests** run one reusable port contract against every adapter implementation. A contract test is therefore a typical outgoing integration test, which is itself a typical integration test.
      - **Unmanaged-dependency integration tests** verify compatibility with an external service or shared dependency.
  - **End-to-end tests** exercise a technical path through a composed application from one of its public entry points.
    - **UI E2E tests** enter through the frontend UI and traverse the composed frontend and its connected system.
    - **API E2E tests** enter through a backend's public API and traverse its composed application. Framework-provided in-process HTTP injection still counts as API E2E when it crosses the real router, middleware, handlers, use cases, and adapters.
      - **Durable API E2E tests** additionally use the real Bun process, SQLite, workers, and workspace lifecycle.
- **High-value acceptance tests** bind an acceptance example at one of those levels.
  - **HVUT** binds the example to a use case or application interface with controlled adapters.
  - **HVIT** binds the example at an integration seam.
  - **HVE2E** binds the example through the deployed-shaped system.

Root scripts are the stable command interface. See the [root scripts](../package.json), [backend scripts](../backend/package.json), and [browser scripts](../browser/package.json) for the available aggregate and focused commands. The [backend Vitest configuration](../backend/vitest.config.ts), [browser Vitest configuration](../browser/vitest.config.ts), and [Playwright configuration](../browser/playwright.config.ts) own test discovery and file matching.

The HVIT and backend HVE2E commands remain valid even when no files currently match them. They are explicit entry points for adding and running those test types. The package acceptance commands run each package's complete high-value acceptance suite.

## Integration-test directions

Classify an integration test from the application core's perspective. Integration tests exercise either an incoming adapter or an outgoing adapter through a real communication mechanism. Merely constructing platform values such as `Request`, `Response`, `Headers`, or `ReadableStream` around an injected function does not create an integration test; that remains an isolated adapter unit test.

### Incoming adapter integration tests

An incoming adapter translates an external stimulus into an application operation. Drive the real incoming mechanism, replace the application collaborator with the test runner's native mock (`vi.fn()` under Vitest), and verify the attempted communication. The test ends at that boundary: application behavior, retained application state, outgoing effects, and collaborator correctness belong to other tests.

For an HTTP handler, send a real request through the router, middleware, validation, and handler stack while mocking the invoked use case or application API. Verify that the mock receives the expected operation and values. Use a socket only when socket behavior itself is relevant. Apply the same pattern to GraphQL operations, webhooks, and other incoming mechanisms.

The UI is also an incoming adapter. Mount the real React component in a browser, provide a mocked `WorkspaceController`, perform a real DOM interaction, and verify the attempted application operation:

```tsx
render(<LiveWorkspacePage controller={controllerSpy} />)

await page.getByRole("button", { name: "Run Procedure" }).click()

// communication verification
expect(controllerSpy.runProcedure).toHaveBeenCalledOnce()
```

This is communication verification across browser event → React handler → application port. It does not test `runProcedure` behavior, TanStack Query, or the backend. A router integration can similarly perform a real navigation and verify that the routed page invokes the expected application operation.

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

Verify requests, authentication, serialization, provider responses, errors, and retry-relevant behavior at the adapter boundary. Apply the [retry policy](retry-policy.md) to decide when a dependency failure is transient and safe to repeat. Keep these tests focused on compatibility with the external protocol; application decisions made from adapter results belong in HVUTs.

## Gate routing

| Layer | Entry condition | Test evidence | Success signal | Failure action |
| --- | --- | --- | --- | --- |
| Change loop | A developer or agent changes behavior | Run the smallest affected root command | Selected suite exits `0` | Fix the named failing test before broadening scope |
| Pre-commit | A local commit includes staged production source under `backend/src` or `browser/src` | Oxlint validates only the staged source files through `bun run lint:files -- <files>` | Lefthook's `lint-staged-source` command exits `0` without changing tracked files | Fix the named lint violation, restage the file, and recommit |
| Pre-push | A local push begins through Lefthook | Backend unit and durable E2E tests, backend HVUT/HVIT/HVE2E acceptance tests, browser typical units, and browser HVUTs | `bun run prepush` exits `0` without changing tracked files | Run `bun run prepush`, fix its first failure, rerun |
| Pull-request CI | A pull request is opened or updated | Lint, static checks, backend and browser HVUTs, and browser HVE2E run in parallel | Required **Quality policy** aggregate check passes | Reproduce with `bun run quality:acceptance` or `bun run frontend:test:hve2e` |
| Main-branch and nightly CI | A commit reaches `main` or the 03:17 UTC schedule runs | Pull-request evidence plus typical unit/integration/durable regression tests, contracts tests, and coverage policy | **Quality policy** passes | Repair through a pull request; do not weaken the gate |

Backend integration stays out of pre-push because it is the slowest typical suite; it runs only on `main` and nightly CI. Browser HVE2E remains mandatory in pull-request CI. The durable E2E remains pre-push because it exercises otherwise uncovered Bun/SQLite/worker behavior in about four seconds. Backend HVIT and HVE2E commands are retained in the pre-push acceptance aggregate; they currently have no matching test files and therefore complete immediately.

## Authority and continuation

- The [root package scripts](../package.json) own the command interface and gate composition. The full test command runs the backend unit, integration, durable, and acceptance suites; browser typical and acceptance suites; contracts unit tests; and static checks. Pull-request CI uses the static, acceptance, and browser HVE2E commands. Main-branch and nightly CI additionally use regression and coverage commands.
- The [backend Vitest configuration](../backend/vitest.config.ts), [browser Vitest configuration](../browser/vitest.config.ts), and [Playwright configuration](../browser/playwright.config.ts) own suite-to-file binding.
- The [coverage policy](../quality/coverage-policy.mjs) owns required CI suites, coverage evidence, and justified exclusions. Its required-suite list records only suite families with committed test files; empty HVIT/HVE2E commands remain runnable.
- [Lefthook configuration](../lefthook.yml) owns staged-source pre-commit lint and local pre-push invocation; the [quality-gates workflow](../.github/workflows/quality-gates.yml) owns shared enforcement.
- A new test type or renamed command is complete only when its package command, root command, runner project, applicable gate, coverage policy, and this document agree. Remove a test type only when all of those references and its tests are removed together.
