import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  optimizeDeps: {
    include: ["react", "react-dom", "vitest-browser-react/pure"],
  },
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/typical/unit/**/*.unit.ts"],
          name: "browser-unit",
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/typical/integration/**/*.integration.ts"],
          name: "browser-composition-integration",
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/typical/incoming/**/*.incoming.integration.ts"],
          name: "browser-incoming-integration",
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: [
            "tests/typical/outgoing/managed/**/*.managed.integration.ts",
          ],
          name: "browser-outgoing-managed-integration",
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: [
            "tests/typical/outgoing/unmanaged/**/*.unmanaged.integration.ts",
          ],
          name: "browser-outgoing-unmanaged-integration",
        },
      },
      {
        extends: true,
        test: {
          environment: "jsdom",
          include: ["tests/acceptance/unit/**/*.hvut.ts"],
          name: "browser-hvut",
        },
      },
      {
        extends: true,
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
            provider: playwright(),
          },
          include: ["tests/acceptance/integration/**/*.hvit.ts"],
          name: "browser-hvit",
          testTimeout: 30_000,
        },
      },
    ],
  },
});
