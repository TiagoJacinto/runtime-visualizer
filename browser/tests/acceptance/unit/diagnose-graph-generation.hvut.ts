import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import App from "../../../src/App.tsx";

let root: Root | undefined;

afterEach(() => {
	root?.unmount();
	root = undefined;
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

describe("Diagnose graph generation in the Procedure view", () => {
	test.each([
		"Type checking failed",
		"Syntax is invalid",
		"With statement is unsupported",
	] as const)("shows %s without a partial graph", async (reason) => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, diagnostics: [{ procedure: "selected.ts", reason }] }), { status: 422, headers: { "content-type": "application/json" } })));
		document.body.innerHTML = '<div id="root"></div>';
		root = createRoot(document.getElementById("root")!);
		await act(async () => root?.render(createElement(App)));
		const source = document.querySelector<HTMLTextAreaElement>("textarea")!;
		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
			setter?.call(source, "work()");
			source.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await act(async () => (document.querySelector("button") as HTMLButtonElement).click());
		expect(document.querySelector('[aria-label="Graph diagnostics"]')?.textContent).toContain(reason);
		expect(document.querySelector('[data-testid="control-flow-graph"]')).toBeNull();
	});
});
