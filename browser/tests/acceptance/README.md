# Browser acceptance tests

Browser acceptance tests use `@amiceli/vitest-cucumber`:

- `unit/**/*.hvut.ts` — high-value unit tests (HVUT)
- `integration/**/*.hvit.ts` — high-value integration tests (HVIT), run in headless Chromium

Install the Chromium binary once with `cd browser && bunx playwright install chromium`.

From the repository root, run one level with `bun run frontend:test:hvut` or `bun run frontend:test:hvit`; run all browser acceptance levels with `bun run frontend:test:acceptance`.

Test placement and gate policy are defined in [`../../../docs/testing.md`](../../../docs/testing.md).
