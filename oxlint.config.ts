import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

const ignorePatterns = [
  ...(core.ignorePatterns ?? []),
  "browser/src/components/generated/**",
  "**/*.d.ts",
];

export default defineConfig({
  extends: [core, react, vitest, antiSlop],
  ignorePatterns,
  jsPlugins: ["eslint-plugin-sonarjs"],
  rules: {
    complexity: ["error", { max: 38 }],
    "react/only-export-components": ["warn", { allowConstantExport: true }],
    "react/rules-of-hooks": "error",
    "sonarjs/cognitive-complexity": ["error", 28],
  },
});
