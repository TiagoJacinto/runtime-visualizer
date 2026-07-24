import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import App from "../../src/App";

describe("control-flow visualization", () => {
	let root: Root | undefined;

	afterEach(() => {
		root?.unmount();
		root = undefined;
		vi.restoreAllMocks();
		document.body.innerHTML = "";
	});

	it("shows Entry, executable statements, and Exit for a selected Procedure", async () => {
		const payload = {
			ok: true,
			cfg: {
				procedures: [{
					nodes: [
						{ id: "entry", kind: "entry", label: "Entry" },
						{ id: "statement-1", kind: "statement", label: "const value = read()", location: { start: { line: 1 }, end: { line: 1 } } },
						{ id: "statement-2", kind: "statement", label: "return value", location: { start: { line: 2 }, end: { line: 2 } } },
						{ id: "exit", kind: "exit", label: "Exit" },
					],
					edges: [
						{ from: "entry", to: "statement-1" },
						{ from: "statement-1", to: "statement-2" },
						{ from: "statement-2", to: "exit" },
					],
				}],
			},
		};
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
			status: 200,
			headers: { "content-type": "application/json" },
		})));
		document.body.innerHTML = '<div id="root"></div>';
		root = createRoot(document.querySelector("#root")!);
		root.render(<App />);

		await vi.waitFor(() => expect(document.querySelector("#procedure-source")).not.toBeNull());
		const textarea = document.querySelector<HTMLTextAreaElement>("#procedure-source")!;
		Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, "const value = read()\nreturn value");
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false));
		document.querySelector<HTMLButtonElement>("button")!.click();

		await vi.waitFor(() => expect(document.querySelector('[data-testid="control-flow-graph"]')?.textContent).toContain("Entry"));
		expect(document.body.textContent).toContain("const value = read()");
		expect(document.body.textContent).toContain("lines 2-2");
		expect(document.body.textContent).toContain("Exit");
		expect(document.body.textContent).toContain("Entry → const value = read()");
		expect(document.body.textContent).toContain("return value → Exit");
	});

	it("shows a useful error when the CFG service returns an empty response", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 502 })));
		document.body.innerHTML = '<div id="root"></div>';
		root = createRoot(document.querySelector("#root")!);
		root.render(<App />);

		await vi.waitFor(() => expect(document.querySelector("#procedure-source")).not.toBeNull());
		const textarea = document.querySelector<HTMLTextAreaElement>("#procedure-source")!;
		textarea.value = "work()";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		document.querySelector<HTMLButtonElement>("button")!.click();

		await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());
		expect(document.body.textContent).toContain("CFG service returned an empty response");
		expect(document.body.textContent).not.toContain("Unexpected end of JSON input");
	});
});
