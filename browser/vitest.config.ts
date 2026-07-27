import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
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
