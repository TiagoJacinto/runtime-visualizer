import { qualityPolicyValues } from "./policy-values.mjs";

export const coveragePolicy = {
	packages: {
		backend: {
			report: "backend/coverage/coverage-final.json",
			thresholds: qualityPolicyValues.coverage.repositoryThresholds,
			productionRoots: ["backend/src/"],
		},
		browser: {
			report: "browser/coverage/coverage-final.json",
			thresholds: qualityPolicyValues.coverage.repositoryThresholds,
			productionRoots: ["browser/src/"],
		},
		contracts: {
			report: "packages/contracts/coverage/coverage-final.json",
			thresholds: qualityPolicyValues.coverage.repositoryThresholds,
			productionRoots: ["packages/contracts/src/"],
		},
	},
	changedProductionCode: {
		floor: qualityPolicyValues.coverage.changedCode.floor,
		ceiling: qualityPolicyValues.coverage.changedCode.ceiling,
		defaultImportance: qualityPolicyValues.coverage.changedCode.defaultImportance,
		productionRoots: ["backend/src/", "browser/src/", "packages/contracts/src/"],
	},
	changedCodeExclusions: qualityPolicyValues.coverage.changedCode.exclusions,
	requiredTestSuites: [
		{
			name: "backend unit",
			command: "backend:test:unit",
			files: "backend/tests/typical/unit/**/*.unit.ts",
		},
		{
			name: "backend integration",
			command: "backend:test:integration",
			files: "backend/tests/typical/integration/**/*.integration.ts",
		},
		{
			name: "backend durable runtime",
			command: "backend:test:durable",
			files: "backend/tests/typical/e2e/**/*.bun.test.ts",
		},
		{
			name: "backend acceptance unit",
			command: "backend:test:hvut",
			files: "backend/tests/acceptance/unit/**/*.hvut.ts",
		},
		{
			name: "browser acceptance unit",
			command: "frontend:test:hvut",
			files: "browser/tests/acceptance/unit/**/*.hvut.ts",
		},
		{
			name: "browser acceptance end-to-end",
			command: "frontend:test:hve2e",
			files: "browser/tests/acceptance/e2e/**/*.hve2e.ts",
		},
		{
			name: "contracts unit",
			command: "contracts:test:unit",
			files: "packages/contracts/tests/**/*.unit.ts",
		},
	],
	coverageReports: [
		{
			name: "backend unit",
			command: "backend:test:coverage:unit",
			report: "backend/coverage/unit/coverage-summary.json",
		},
		{
			name: "backend integration",
			command: "backend:test:coverage:integration",
			report: "backend/coverage/integration/coverage-summary.json",
		},
		{
			name: "browser acceptance unit",
			command: "frontend:test:coverage:hvut",
			report: "browser/coverage/unit/coverage-summary.json",
		},
		{
			name: "contracts unit",
			command: "contracts:test:coverage:unit",
			report: "packages/contracts/coverage/unit/coverage-summary.json",
		},
	],
	exclusions: [
		{
			config: "backend/vitest.config.ts",
			pattern: "src/**/*.d.ts",
			reason: "Type declarations are not executable.",
			verification: "not-executable",
			requireMatch: false,
		},
		{
			config: "backend/vitest.config.ts",
			pattern: "src/modules/analysis/infra/sqlite-revision-history.ts",
			reason: "Vitest Node workers cannot load Bun SQLite.",
			verification: "backend:test:durable",
		},
		{
			config: "backend/vitest.config.ts",
			pattern:
				"src/modules/execution/useCases/executeProcedure/execution-worker.ts",
			reason: "Vitest Node workers cannot load the Bun worker runtime.",
			verification: "backend:test:durable",
		},
		{
			config: "browser/vitest.config.ts",
			pattern: "src/**/*.d.ts",
			reason: "Type declarations are not executable.",
			verification: "not-executable",
			requireMatch: false,
		},
		{
			config: "browser/vitest.config.ts",
			pattern: "src/pages/liveWorkspace/components/**/*.tsx",
			reason:
				"Presentation components are covered through browser acceptance journeys.",
			verification: "frontend:test:hve2e",
		},
		{
			config: "browser/vitest.config.ts",
			pattern: "src/pages/liveWorkspace/live-workspace.page.tsx",
			reason:
				"The composed workspace page is covered through browser acceptance journeys.",
			verification: "frontend:test:hve2e",
		},
		{
			config: "browser/vitest.config.ts",
			pattern: "src/pages/liveWorkspace/prototype/**",
			reason:
				"Prototype alternatives are not shipped by the application entry point.",
			verification: "not-shipped",
		},
		{
			config: "browser/vitest.config.ts",
			pattern: "src/app.tsx",
			reason:
				"The application composition root is covered through browser acceptance journeys.",
			verification: "frontend:test:hve2e",
		},
		{
			config: "browser/vitest.config.ts",
			pattern: "src/main.tsx",
			reason:
				"The browser entry point is covered through browser acceptance journeys.",
			verification: "frontend:test:hve2e",
		},
	],
};
