# Backend acceptance tests

Acceptance tests use `@amiceli/vitest-cucumber` and live in this directory:

- `unit/**/*.hvut.ts` — high-value unit tests (HVUT)
- `integration/**/*.hvit.ts` — high-value integration tests (HVIT)
- `e2e/**/*.hve2e.ts` — high-value end-to-end tests (HVE2E)

Use `loadFeature` and `describeFeature` to bind each test to its `.feature` file. From the repository root, run one level with `bun run backend:test:hvut`, `bun run backend:test:hvit`, or `bun run backend:test:hve2e`; run all backend acceptance levels with `bun run backend:test:acceptance`.

The command for a level remains available when that level has no tests yet. Test placement and gate policy are defined in [`../../../docs/testing.md`](../../../docs/testing.md).
