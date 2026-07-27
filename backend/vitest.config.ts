import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
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
