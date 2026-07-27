import { createElement } from "react";
import { cleanup, render } from "vitest-browser-react/pure";
import { afterEach, expect, test, vi } from "vitest";
import App from "../../../src/App.tsx";

afterEach(async () => {
	await cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test("Submit two named files together", async () => {
	const fetchMock = vi.fn(async () => new Response(JSON.stringify({
		cfg: { procedures: [{ nodes: [], edges: [] }] },
	})));
	vi.stubGlobal("fetch", fetchMock);
	const screen = await render(createElement(App));

	await screen.getByRole("textbox", { name: "File 1 name" }).fill("main.ts");
	await screen.getByRole("textbox", { name: "File 2 name" }).fill("helper.ts");
	await screen.getByRole("textbox", { name: "File 1 source" }).fill("import { helper } from './helper'; helper();");
	await screen.getByRole("textbox", { name: "File 2 source" }).fill("export function helper() {}");
	await screen.getByRole("button", { name: "Visualize control flow" }).click();

	const requestInit = (fetchMock as unknown as { mock: { calls: Array<[string, RequestInit?]> } }).mock.calls.at(-1)?.[1];
	const request = JSON.parse(String(requestInit?.body)) as {
		source: string;
		filePath: string;
		files: Record<string, string>;
	};
	expect(request.source).toContain("./helper");
	expect(request.filePath).toBe("main.ts");
	expect(request.files).toEqual({ "helper.ts": "export function helper() {}" });
});
