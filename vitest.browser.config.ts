import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/browser/**/*.spec.ts", "tests/browser/**/*.spec.tsx", "tests/e2e/**/*.spec.ts", "tests/e2e/**/*.spec.tsx"],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: "chromium" }],
		},
	},
});
