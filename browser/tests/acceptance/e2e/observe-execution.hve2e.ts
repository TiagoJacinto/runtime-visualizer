import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import {
	test,
	graphNode,
	parseFields,
	visualizeForExecution,
	type Fields,
} from "./visualize-control-flow.hve2e.ts";

const { Then, When } = createBdd(test);

When(
	/^I run\(procedure: "([^"]+)"\)$/,
	async ({ page, scenario }, _procedure) => {
		await visualizeForExecution(page, scenario);
		await page.getByRole("button", { name: "Run procedure" }).click();
	},
);

Then(
	/^I (?:await view|view) ExecutionHighlighting\{([\s\S]*?)\}( not)? in ControlFlowGraph: .+$/,
	async ({ page }, fieldText, absent) => {
		const fields: Fields = parseFields(fieldText);
		if (fields.node === undefined) {
			await expect(page.locator('[aria-current="step"]')).toHaveCount(
				absent ? 0 : 1,
			);
			return;
		}
		const node = graphNode(page, fields.node);
		if (absent) {
			await expect(node).not.toHaveAttribute("aria-current", "step");
		} else {
			await expect(node).toHaveAttribute("aria-current", "step", {
				timeout: 15_000,
			});
		}
	},
);
