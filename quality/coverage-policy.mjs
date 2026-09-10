import { qualityPolicyValues } from "./policy-values.mjs";

export const coveragePolicy = {
  changedCodeExclusions: qualityPolicyValues.coverage.changedCode.exclusions,
  changedProductionCode: {
    ceiling: qualityPolicyValues.coverage.changedCode.ceiling,
    defaultImportance:
      qualityPolicyValues.coverage.changedCode.defaultImportance,
    floor: qualityPolicyValues.coverage.changedCode.floor,
    productionRoots: [
      "backend/src/",
      "browser/src/",
      "packages/contracts/src/",
    ],
  },
  coverageReports: [
    {
      command: "backend:test:coverage:unit",
      name: "backend unit",
      report: "backend/coverage/unit/coverage-summary.json",
    },
    {
      command: "backend:test:coverage:integration",
      name: "backend integration",
      report: "backend/coverage/integration/coverage-summary.json",
    },
    {
      command: "frontend:test:coverage:hvut",
      name: "browser acceptance unit",
      report: "browser/coverage/unit/coverage-summary.json",
    },
    {
      command: "contracts:test:coverage:unit",
      name: "contracts unit",
      report: "packages/contracts/coverage/unit/coverage-summary.json",
    },
  ],
  exclusions: [
    {
      config: "backend/vitest.config.ts",
      pattern: "src/**/*.d.ts",
      reason: "Type declarations are not executable.",
      requireMatch: false,
      verification: "not-executable",
    },
    {
      config: "backend/vitest.config.ts",
      pattern: "src/modules/analysis/infra/sqlite-revision-history.ts",
      reason: "Vitest Node workers cannot load Bun SQLite.",
      verification: "backend:test:durable",
    },
    {
      config: "backend/vitest.config.ts",
      pattern:
        "src/modules/execution/useCases/executeProcedure/execution-worker.ts",
      reason: "Vitest Node workers cannot load the Bun worker runtime.",
      verification: "backend:test:durable",
    },
    {
      config: "browser/vitest.config.ts",
      pattern: "src/**/*.d.ts",
      reason: "Type declarations are not executable.",
      requireMatch: false,
      verification: "not-executable",
    },
    {
      config: "browser/vitest.config.ts",
      pattern: "src/pages/liveWorkspace/components/**/*.tsx",
      reason:
        "Presentation components are covered through browser acceptance journeys.",
      verification: "frontend:test:hve2e",
    },
    {
      config: "browser/vitest.config.ts",
      pattern: "src/pages/liveWorkspace/live-workspace.page.tsx",
      reason:
        "The composed workspace page is covered through browser acceptance journeys.",
      verification: "frontend:test:hve2e",
    },
    {
      config: "browser/vitest.config.ts",
      pattern: "src/pages/liveWorkspace/prototype/**",
      reason:
        "Prototype alternatives are not shipped by the application entry point.",
      verification: "not-shipped",
    },
    {
      config: "browser/vitest.config.ts",
      pattern: "src/app.tsx",
      reason:
        "The application composition root is covered through browser acceptance journeys.",
      verification: "frontend:test:hve2e",
    },
    {
      config: "browser/vitest.config.ts",
      pattern: "src/main.tsx",
      reason:
        "The browser entry point is covered through browser acceptance journeys.",
      verification: "frontend:test:hve2e",
    },
  ],
  packages: {
    backend: {
      productionRoots: ["backend/src/"],
      report: "backend/coverage/coverage-final.json",
      thresholds: qualityPolicyValues.coverage.repositoryThresholds,
    },
    browser: {
      productionRoots: ["browser/src/"],
      report: "browser/coverage/coverage-final.json",
      thresholds: qualityPolicyValues.coverage.repositoryThresholds,
    },
    contracts: {
      productionRoots: ["packages/contracts/src/"],
      report: "packages/contracts/coverage/coverage-final.json",
      thresholds: qualityPolicyValues.coverage.repositoryThresholds,
    },
  },
  requiredTestSuites: [
    {
      command: "backend:test:unit",
      files: "backend/tests/typical/unit/**/*.unit.ts",
      name: "backend unit",
    },
    {
      command: "backend:test:integration",
      files: "backend/tests/typical/integration/**/*.integration.ts",
      name: "backend integration",
    },
    {
      command: "backend:test:durable",
      files: "backend/tests/typical/e2e/**/*.bun.test.ts",
      name: "backend durable runtime",
    },
    {
      command: "backend:test:hvut",
      files: "backend/tests/acceptance/unit/**/*.hvut.ts",
      name: "backend acceptance unit",
    },
    {
      command: "frontend:test:hvut",
      files: "browser/tests/acceptance/unit/**/*.hvut.ts",
      name: "browser acceptance unit",
    },
    {
      command: "frontend:test:hve2e",
      files: "browser/tests/acceptance/e2e/**/*.hve2e.ts",
      name: "browser acceptance end-to-end",
    },
    {
      command: "contracts:test:unit",
      files: "packages/contracts/tests/**/*.unit.ts",
      name: "contracts unit",
    },
  ],
};
