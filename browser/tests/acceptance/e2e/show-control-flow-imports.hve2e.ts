import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import {
	test,
	configureProcedure,
	graphNode,
	parseFields,
	type Fields,
} from "./visualize-control-flow.hve2e.ts";

const { Given, Then } = createBdd(test);

Given(
	/^(current|imported):Procedure\{name: "([^"]+)", kind: (File|Function), status: (Ready|TypeError|SyntaxError|Unsupported), source: "([\s\S]*)"\}$/,
	async ({ page, scenario }, role, name, kind, status, source) => {
		await configureProcedure(
			{ page, scenario },
			role,
			name,
			kind,
			status,
			source,
		);
	},
);

Given(/^Import\{visibility: Visible\}$/, async ({ page, scenario }) => {
	scenario.showImports = true;
	await page.getByRole("checkbox", { name: "Show imports" }).check();
});

Then(
	/^I view Import\{([\s\S]*?)\}( not)? in ControlFlowGraph: .+$/,
	async ({ page }, fieldText, absent) => {
		const fields: Fields = parseFields(fieldText);
		const importNode = graphNode(page, fields.source);
		await expect(importNode).toHaveCount(absent ? 0 : 1);
		if (!absent)
			await expect(importNode).toHaveAttribute("data-kind", "import");
	},
);
