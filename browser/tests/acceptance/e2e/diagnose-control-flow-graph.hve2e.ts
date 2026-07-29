import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import {
	test,
	configureProcedure,
	parseFields,
	type Fields,
} from "./visualize-control-flow.hve2e.ts";

const { Given, Then } = createBdd(test);

Given(
	/^(required|unrelated):Procedure\{name: "([^"]+)", kind: (File|Function), status: (Ready|TypeError|SyntaxError|Unsupported), source: "([\s\S]*)"\}$/,
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

Then(
	/^I view GraphDiagnostic\{([\s\S]*?)\}( not)? in (?:Procedure|ControlFlowGraph): .+$/,
	async ({ page }, fieldText, absent) => {
		const fields: Fields = parseFields(fieldText);
		let diagnostic = page.getByRole("alert").getByRole("listitem");
		if (fields.reason !== undefined)
			diagnostic = diagnostic.filter({ hasText: fields.reason });
		if (fields.dependency !== undefined)
			diagnostic = diagnostic.filter({ hasText: `(${fields.dependency})` });
		await expect(diagnostic).toHaveCount(absent ? 0 : 1);
	},
);

Then(
	/^I view ControlFlowGraph\{[\s\S]*?\}( not)? in Procedure: .+$/,
	async ({ page }, absent) => {
		const graph = page.getByTestId("control-flow-graph");
		if (absent) await expect(graph).toHaveCount(0);
		else await expect(graph).toBeVisible();
	},
);
