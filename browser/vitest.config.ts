import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				"src/**/*.d.ts",
				"src/components/generated/**",
				// The Workspace shell is covered by Playwright acceptance scenarios;
				// keep Vitest focused on its state, gateway, and projection seams.
				"src/pages/liveWorkspace/components/**/*.tsx",
				"src/pages/liveWorkspace/liveWorkspace.page.tsx",
				"src/pages/liveWorkspace/prototype/**",
				"src/App.tsx",
				"src/main.tsx",
				"src/settings/theme.ts",
			],
			reporter: ["text", "json-summary"],
			thresholds: {
				lines: 58,
				branches: 58,
				functions: 58,
				statements: 58,
			},
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
