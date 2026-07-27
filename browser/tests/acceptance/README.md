# Server acceptance tests

Acceptance tests use `@amiceli/vitest-cucumber` and live in this directory:

- `*.hvut.ts` — high-value unit tests (HVUT)
- `*.hvit.ts` — high-value integration tests (HVIT)
- `*.hve2e.ts` — high-value end-to-end tests (HVE2E)

Use `loadFeature` and `describeFeature` to bind each test to its `.feature` file.
Run them with `bun test:browser:hvut`, `bun test:browser:hvit`,
or `bun test:browser:hve2e` from the repository root.
