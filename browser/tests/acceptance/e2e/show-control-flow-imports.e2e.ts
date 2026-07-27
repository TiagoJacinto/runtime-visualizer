import { createElement } from "react";
import { cleanup, render } from "vitest-browser-react/pure";
import { afterEach, expect, test, vi } from "vitest";
import App from "../../../src/App.tsx";

afterEach(async () => {
	await cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const graph = (showImports: boolean) => ({
	cfg: {
		procedures: [{
			nodes: [
				...(showImports ? [{ id: "import", kind: "import", label: "import { helper } from './helper'" }] : []),
				{ id: "helper", kind: "statement", label: "helper()" },
			],
			edges: [],
		}],
	},
});

test("Hide imports by default", async () => {
	vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(graph(false)))));
	const screen = await render(createElement(App));
	await screen.getByRole("button", { name: "Visualize control flow" }).click();

	await expect.element(screen.getByText("import { helper } from './helper'")).not.toBeInTheDocument();
	await expect.element(screen.getByText("helper()")).toBeInTheDocument();
});

test("Show current-file imports as context", async () => {
	const fetchMock = vi.fn(async () => new Response(JSON.stringify(graph(true))));
	vi.stubGlobal("fetch", fetchMock);
	const screen = await render(createElement(App));
	const checkbox = screen.getByRole("checkbox", { name: "Show imports" });
	await checkbox.click();
	await expect.element(checkbox).toBeChecked();
	await screen.getByRole("button", { name: "Visualize control flow" }).click();
	const request = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)) as { showImports?: boolean };
	expect(request.showImports).toBe(true);
	await expect.element(screen.getByText("import { helper } from './helper'")).toBeInTheDocument();
	await expect.element(screen.getByText("helper()")).toBeInTheDocument();
	await expect.element(screen.getByLabelText("Control-flow transitions")).not.toHaveTextContent("import { helper } from './helper'");
	await expect.element(screen.getByText("work()")).not.toBeInTheDocument();
});
