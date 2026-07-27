import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["tests/unit/**/*.spec.ts"],
					environment: "node",
				},
			},
			{
				extends: true,
				test: {
					name: "backend",
					include: ["tests/backend/**/*.spec.ts"],
					environment: "node",
				},
			},
			{
				extends: true,
				test: {
					name: "frontend",
					include: ["tests/frontend/**/*.spec.ts", "tests/frontend/**/*.spec.tsx"],
					environment: "jsdom",
				},
			},
			{
				extends: true,
				test: {
					name: "cli",
					include: ["tests/cli/**/*.spec.ts"],
					environment: "node",
				},
			},
		],
	},
});
