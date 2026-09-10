import { defineConfig } from "vitest/config";

import { coveragePolicy } from "../quality/coverage-policy.mjs";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "src/**/*.d.ts",
        "src/modules/analysis/infra/sqlite-revision-history.ts",
        "src/modules/execution/useCases/executeProcedure/execution-worker.ts",
      ],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      thresholds: coveragePolicy.packages.backend.thresholds,
    },
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/typical/unit/**/*.unit.ts"],
          name: "backend-unit",
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/typical/integration/**/*.integration.ts"],
          name: "backend-integration",
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/typical/e2e/**/*.e2e.ts"],
          name: "backend-e2e",
        },
      },

      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/acceptance/unit/**/*.hvut.ts"],
          name: "backend-hvut",
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/acceptance/integration/**/*.hvit.ts"],
          name: "backend-hvit",
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/acceptance/e2e/**/*.hve2e.ts"],
          name: "backend-hve2e",
        },
      },
    ],
  },
});
