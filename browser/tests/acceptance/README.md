# Browser acceptance tests

Acceptance tests use `@amiceli/vitest-cucumber` for HVUT and HVIT bindings and `playwright-bdd` for HVE2E bindings:

- `unit/**/*.hvut.ts` — high-value unit tests (HVUT)
- `integration/**/*.hvit.ts` — high-value integration tests (HVIT)
- `e2e/**/*.hve2e.ts` — high-value end-to-end tests (HVE2E)

From the repository root, run one level with `bun run frontend:test:hvut`, `bun run frontend:test:hvit`, or `bun run frontend:test:hve2e`; run all browser acceptance levels with `bun run frontend:test:acceptance`.

The command for a level remains available when that level has no tests yet. Test placement and gate policy are defined in [`../../../docs/testing.md`](../../../docs/testing.md).
