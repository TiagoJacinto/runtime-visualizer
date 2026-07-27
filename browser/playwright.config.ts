import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
	featuresRoot: "../features",
	paths: ["../features/**/*.feature"],
	require: ["tests/bdd/steps/**/*.ts"],
	outputDir: "tests/acceptance/e2e",
	missingSteps: "fail-on-run",
});

export default defineConfig({
	testDir,
	testMatch: /.*\.feature\.spec\.ts/,
	fullyParallel: true,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:5173",
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
});
