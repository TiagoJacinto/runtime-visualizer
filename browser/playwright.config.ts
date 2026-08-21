import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
	featuresRoot: "../features",
	features: "../features/**/*.feature",
	// The old domain feature contracts stay available to backend acceptance suites.
	tags: "not @legacy-ui",
	steps: "tests/acceptance/e2e/live-workspace.hve2e.ts",
	outputDir: ".features-gen",
	missingSteps: "fail-on-gen",
});

export default defineConfig({
	testDir,
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:5173",
		trace: "on-first-retry",
	},
	webServer: [
		{
			command: "bun run backend:dev",
			cwd: "..",
			url: "http://127.0.0.1:3000/api/health",
			reuseExistingServer: true,
		},
		{
			command: "bun run frontend:dev",
			cwd: "..",
			url: "http://127.0.0.1:5173",
			reuseExistingServer: true,
		},
	],
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
});
