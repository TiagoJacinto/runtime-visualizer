import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			// bun:sqlite is unavailable in Vitest's Node workers; SQLite is validated by the direct Bun smoke test.
			exclude: [
				"src/**/*.d.ts",
				"src/modules/analysis/infra/sqliteRevisionHistory.ts",
				// Execution runs in a Bun worker, which Node-based Vitest cannot load.
				"src/modules/execution/useCases/executeProcedure/execution-worker.ts",
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
					name: "backend-unit",
					include: ["tests/typical/unit/**/*.unit.ts"],
					environment: "node",
				},
			},
			{
				extends: true,
				test: {
					name: "backend-integration",
					include: ["tests/typical/integration/**/*.integration.ts"],
					environment: "node",
					testTimeout: 30_000,
				},
			},
			{
				extends: true,
				test: {
					name: "backend-e2e",
					include: ["tests/typical/e2e/**/*.e2e.ts"],
					environment: "node",
				},
			},

			{
				extends: true,
				test: {
					name: "backend-hvut",
					include: ["tests/acceptance/unit/**/*.hvut.ts"],
					environment: "node",
				},
			},
			{
				extends: true,
				test: {
					name: "backend-hvit",
					include: ["tests/acceptance/integration/**/*.hvit.ts"],
					environment: "node",
				},
			},
			{
				extends: true,
				test: {
					name: "backend-hve2e",
					include: ["tests/acceptance/e2e/**/*.hve2e.ts"],
					environment: "node",
				},
			},
		],
	},
});
