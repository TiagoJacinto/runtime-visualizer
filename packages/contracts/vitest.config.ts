import { defineConfig } from "vitest/config";
import { coveragePolicy } from "../../quality/coverage-policy.mjs";

export default defineConfig({
	test: {
		include: ["tests/**/*.unit.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			reporter: ["text", "json-summary", "json"],
			thresholds: coveragePolicy.packages.contracts.thresholds,
		},
	},
});
