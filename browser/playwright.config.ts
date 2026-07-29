/// <reference types="node" />

import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";
import process from "node:process";

const testDir = defineBddConfig({
	featuresRoot: "../features",
	features: "../features/**/*.feature",
	steps: "tests/acceptance/e2e/*.hve2e.ts",
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
			reuseExistingServer: !process.env.CI,
		},
		{
			command: "bun run frontend:dev",
			cwd: "..",
			url: "http://127.0.0.1:5173",
			reuseExistingServer: !process.env.CI,
		},
	],
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
});
