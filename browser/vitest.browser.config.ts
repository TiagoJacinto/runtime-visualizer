import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: "frontend-e2e",
					include: ["tests/e2e/**/*.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "browser-hve2e",
					include: ["tests/acceptance/**/*.e2e.ts"],
				},
			},
		],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: "chromium" }],
		},
	},
});
