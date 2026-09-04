import { cpSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// Keep the browser server away from the developer's target files and durable
// history. The config is loaded once by bddgen and once by Playwright, so this
// reset also makes reruns deterministic after an interrupted scenario.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testWorkspace = resolve(repositoryRoot, ".playwright-live-workspace");
rmSync(testWorkspace, { recursive: true, force: true });
cpSync(resolve(repositoryRoot, "target"), testWorkspace, { recursive: true });
rmSync(resolve(testWorkspace, "hve2e-slow.ts"), { force: true });
const slowSource = `export async function run(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 20000));
}

await run();
`;
writeFileSync(resolve(testWorkspace, "hve2e-queue.ts"), slowSource);
writeFileSync(resolve(testWorkspace, "hve2e-cancel.ts"), slowSource);
const testDatabase = resolve(testWorkspace, "revisions.sqlite");

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
	timeout: 90_000,
	expect: { timeout: 15_000 },
	workers: 1,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:4173",
		trace: "on-first-retry",
	},
	webServer: [
		{
			command: `RUNTIME_VISUALIZER_FILES_FOLDER=${testWorkspace} RUNTIME_VISUALIZER_DATABASE_PATH=${testDatabase} PORT=4301 bun run backend:dev`,
			cwd: "..",
			url: "http://127.0.0.1:4301/api/health",
			reuseExistingServer: false,
		},
		{
			command:
				"VITE_API_PORT=4301 bun run frontend:dev -- --host 127.0.0.1 --port 4173",
			cwd: "..",
			url: "http://127.0.0.1:4173",
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
