import { createBdd } from "playwright-bdd";
import { test, configureProcedure } from "./visualize-control-flow.hve2e.ts";

const { Given } = createBdd(test);

Given(
	/^(selected|dependency):Procedure\{name: "([^"]+)", kind: (File|Function), status: (Ready|TypeError|SyntaxError|Unsupported), source: "([\s\S]*)"\}$/,
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
