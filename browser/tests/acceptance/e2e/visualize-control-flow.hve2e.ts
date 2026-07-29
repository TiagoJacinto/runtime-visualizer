import { expect, type Locator, type Page } from "@playwright/test";
import { createBdd, test as base } from "playwright-bdd";

type ProcedureKind = "File" | "Function";
type ProcedureStatus = "Ready" | "TypeError" | "SyntaxError" | "Unsupported";
type ProcedureState = {
	name: string;
	kind: ProcedureKind;
	status: ProcedureStatus;
	source: string;
};
export type ScenarioState = {
	selected?: ProcedureState;
	dependency?: ProcedureState;
	showImports: boolean;
};
type ScenarioFixtures = { scenario: ScenarioState };
type StepContext = { page: Page; scenario: ScenarioState };
export type Fields = Record<string, string>;

export const test = base.extend<ScenarioFixtures>({
	scenario: async ({ page }, provide) => {
		await page.goto("/");
		await provide({
			selected: undefined,
			dependency: undefined,
			showImports: false,
		});
	},
});

export const { Given, When, Then } = createBdd(test);

const nodeKinds: Record<string, string[]> = {
	Entry: ["entry"],
	Exit: ["exit"],
	Executable: [
		"statement",
		"return",
		"throw",
		"break",
		"continue",
		"try",
		"catch",
		"finally",
	],
	Decision: ["branch", "switch"],
};

const valueDeclarations = new Map<string, string>([
	["ready", "declare let ready: any;"],
	["kind", "declare const kind: string;"],
	["retry", "declare const retry: boolean;"],
	["values", "declare const values: any;"],
	["condition", "declare const condition: boolean;"],
	["value", "declare let value: any;"],
	["callback", "declare const callback: (() => unknown) | null;"],
	["user", "declare const user: { profile: unknown } | null;"],
	["key", 'declare const key: "field" | null;'],
	["fallback", 'declare function fallback(): "field";'],
	["Panel", "declare function Panel(): any;"],
]);

function sourceForAnalysis(source: string, status: ProcedureStatus): string {
	if (status !== "Ready") return source;
	const identifiers = new Set(source.match(/[A-Za-z_$][\w$]*/g) ?? []);
	const declaredIdentifiers = new Set(
		Array.from(
			source.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g),
			(match) => match[1],
		),
	);
	const declarations: string[] = [];
	for (const [name, declaration] of valueDeclarations) {
		if (identifiers.has(name) && !declaredIdentifiers.has(name)) {
			declarations.push(declaration);
		}
	}
	const contextualDeclarations =
		declarations.length === 0 ? "" : `\n${declarations.join("\n")}`;
	return `${source}${contextualDeclarations}\nexport {};`;
}

function sourceForExecution(source: string): string {
	return `${source}\nfunction prepare() {}\nfunction work() {}\nfunction wait() {}\nfunction ready() {}`;
}

export async function configureProcedure(
	{ page, scenario }: StepContext,
	role: string | undefined,
	name: string,
	kind: ProcedureKind,
	status: ProcedureStatus,
	source: string,
): Promise<void> {
	const selected =
		role === undefined || role === "selected" || role === "current";
	const normalizedSource = source.replaceAll("\\n", "\n");
	const fileName =
		kind === "Function" && !/\.[cm]?[jt]sx?$/.test(name) ? `${name}.ts` : name;
	const procedure = { name: fileName, kind, status, source: normalizedSource };

	if (selected) {
		scenario.selected = procedure;
		await page.getByLabel("File 1 name").fill(fileName);
		await page
			.getByLabel("Function name (optional)")
			.fill(kind === "Function" ? name : "");
		await page
			.getByLabel("File 1 source")
			.fill(sourceForAnalysis(normalizedSource, status));
		if (status === "Ready" && normalizedSource.includes("from './helper'")) {
			await page.getByLabel("File 2 name").fill("helper.ts");
			await page
				.getByLabel("File 2 source")
				.fill("export function helper() {}");
		}
		if (status === "Ready" && normalizedSource.includes("from './types'")) {
			await page.getByLabel("File 2 name").fill("types.ts");
			await page
				.getByLabel("File 2 source")
				.fill("export interface JobSpec {}");
		}
		return;
	}

	scenario.dependency = procedure;
	await page.getByLabel("File 2 name").fill(fileName);
	await page
		.getByLabel("File 2 source")
		.fill(sourceForAnalysis(normalizedSource, status));
}

Given(
	/^Procedure\{name: "([^"]+)", kind: (File|Function), status: (Ready|TypeError|SyntaxError|Unsupported), source: "([\s\S]*)"\}$/,
	async ({ page, scenario }, name, kind, status, source) => {
		await configureProcedure(
			{ page, scenario },
			undefined,
			name,
			kind,
			status,
			source,
		);
	},
);

When(
	/^I visualizeControlFlow\(procedure: "([^"]+)"\)$/,
	async ({ page }, _procedure) => {
		await page.getByRole("button", { name: "Visualize control flow" }).click();
	},
);

export function parseFields(text: string): Fields {
	const fields: Fields = {};
	const pattern = /([A-Za-z ]+):\s*("(?:\\.|[^"])*"|[^,]+)(?:,\s*|$)/g;
	for (const match of text.matchAll(pattern)) {
		const raw = match[2].trim();
		fields[match[1].trim()] = raw.startsWith('"') ? JSON.parse(raw) : raw;
	}
	return fields;
}

function graphNodes(page: Page): Locator {
	return page.getByRole("list", { name: "Graph nodes" }).getByRole("listitem");
}

export function graphNode(page: Page, label: string): Locator {
	return graphNodes(page).filter({
		has: page.getByText(label, { exact: true }),
	});
}

function expectedKinds(kind: string): string[] {
	return nodeKinds[kind] ?? [kind.toLowerCase()];
}

async function expectNode(page: Page, expected: Fields): Promise<void> {
	const node = graphNode(page, expected.label);
	await expect(node).toHaveCount(1);
	if (expected.kind !== undefined) {
		await expect(node).toHaveAttribute(
			"data-kind",
			new RegExp(`^(${expectedKinds(expected.kind).join("|")})$`),
		);
	}
	if (expected["line range"] === "Boundary") {
		await expect(node).not.toContainText("(lines ");
	} else if (expected["line range"] !== undefined) {
		await expect(node).toContainText(`(lines ${expected["line range"]})`);
	}
}

Then(
	/^I view GraphNode\{([\s\S]*?)\}( not)? in ControlFlowGraph: .+$/,
	{ arityCheck: false },
	async ({ page }, fieldText, absent, table) => {
		const fields = parseFields(fieldText);
		if (table != null) {
			for (const row of table.hashes()) await expectNode(page, row);
			return;
		}
		const node = graphNode(page, fields.label);
		if (absent) {
			await expect(node).toHaveCount(0);
			return;
		}
		await expectNode(page, fields);
	},
);

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function transitionText(fields: Fields): string {
	const outcome =
		fields.outcome === undefined || fields.outcome === ""
			? ""
			: ` (${fields.outcome})`;
	return `${fields.from}${outcome} → ${fields.to}`;
}

export function graphTransitions(page: Page): Locator {
	return page
		.getByRole("list", { name: "Control-flow transitions" })
		.getByRole("listitem");
}

async function expectTransition(
	page: Page,
	fields: Fields,
	absent = false,
): Promise<void> {
	const text = transitionText(fields);
	const transition = graphTransitions(page).filter({
		hasText: new RegExp(`^${escapeRegex(text)}$`),
	});
	await expect(transition).toHaveCount(absent ? 0 : 1);
}

Then(
	/^I view ControlFlowTransition\{([\s\S]*?)\}( not)? in ControlFlowGraph: .+$/,
	{ arityCheck: false },
	async ({ page }, fieldText, absent, table) => {
		if (table != null) {
			for (const row of table.hashes()) await expectTransition(page, row);
			return;
		}
		await expectTransition(page, parseFields(fieldText), Boolean(absent));
	},
);

export async function visualizeForExecution(
	page: Page,
	scenario: ScenarioState,
): Promise<void> {
	if (scenario.selected !== undefined) {
		await page
			.getByLabel("File 1 source")
			.fill(sourceForExecution(scenario.selected.source));
	}
	await page.getByRole("button", { name: "Visualize control flow" }).click();
	await expect(page.getByTestId("control-flow-graph")).toBeVisible();
}
