import { defineConfig } from "vitest/config";
import { coveragePolicy } from "../quality/coverage-policy.mjs";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				"src/**/*.d.ts",
				"src/pages/liveWorkspace/components/**/*.tsx",
				"src/pages/liveWorkspace/liveWorkspace.page.tsx",
				"src/pages/liveWorkspace/prototype/**",
				"src/App.tsx",
				"src/main.tsx",
			],
			reporter: ["text", "json-summary", "json"],
			thresholds: coveragePolicy.packages.browser.thresholds,
		},
		projects: [
			{
				extends: true,
				test: {
					name: "browser-unit",
					include: ["tests/typical/unit/**/*.unit.ts"],
					environment: "node",
				},
			},
			{
				extends: true,
				test: {
					name: "browser-integration",
					include: ["tests/typical/integration/**/*.integration.ts"],
					environment: "node",
				},
			},
			{
				extends: true,
				test: {
					name: "browser-e2e",
					include: ["tests/typical/e2e/**/*.e2e.ts"],
					environment: "node",
				},
			},

			{
				extends: true,
				test: {
					name: "browser-hvut",
					include: ["tests/acceptance/unit/**/*.hvut.ts"],
					environment: "jsdom",
				},
			},
			{
				extends: true,
				test: {
					name: "browser-hvit",
					include: ["tests/acceptance/integration/**/*.hvit.ts"],
					environment: "node",
				},
			},
		],
	},
});
