import { createElement } from "react";
import { cleanup, render } from "vitest-browser-react/pure";
import { afterEach, expect, test, vi } from "vitest";
import App from "../../../src/App.tsx";

afterEach(async () => {
	await cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const graph = {
	cfg: {
		procedures: [{
			nodes: [
				{ id: "entry", kind: "entry", label: "Entry" },
				{ id: "prepare", kind: "statement", label: "prepare()" },
				{ id: "ready", kind: "branch", label: "ready" },
				{ id: "work", kind: "statement", label: "work()" },
				{ id: "wait", kind: "statement", label: "wait()" },
				{ id: "exit", kind: "exit", label: "Exit" },
			],
			edges: [
				{ from: "entry", to: "prepare", kind: "entry" },
				{ from: "prepare", to: "ready" },
				{ from: "ready", to: "work", label: "true", kind: "true" },
				{ from: "ready", to: "wait", label: "false", kind: "false" },
				{ from: "work", to: "exit" },
				{ from: "wait", to: "exit" },
			],
		}],
	},
};

test("Highlight the selected execution path and clear it at completion", async () => {
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		if (String(input) === "/api/execute") {
			return new Response(JSON.stringify({
				ok: true,
				events: [{ nodeId: "prepare" }, { nodeId: "ready" }, { nodeId: "work" }],
				result: { status: "Succeeded" },
			}));
		}
		return new Response(JSON.stringify(graph));
	});
	vi.stubGlobal("fetch", fetchMock);
	const screen = await render(createElement(App));
	await screen.getByRole("button", { name: "Visualize control flow" }).click();

	const preparation = screen.getByTestId("graph-node-prepare");
	const decision = screen.getByTestId("graph-node-ready");
	const selected = screen.getByTestId("graph-node-work");
	const untaken = screen.getByTestId("graph-node-wait");
	await expect.element(preparation).toBeInTheDocument();
	await expect.element(untaken).toBeInTheDocument();
	await screen.getByRole("button", { name: "Run procedure" }).click();
	await expect.poll(() => fetchMock.mock.calls.some(([input]) => String(input) === "/api/execute")).toBe(true);

	await expect.element(preparation).toHaveAttribute("data-execution-state", "active");
	await expect.element(decision).toHaveAttribute("data-execution-state", "active");
	await expect.element(selected).toHaveAttribute("data-execution-state", "active");
	await expect.element(untaken).not.toHaveAttribute("data-execution-state", "active");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Execution complete");
	await expect.element(preparation).not.toHaveAttribute("data-execution-state", "active");
	await expect.element(decision).not.toHaveAttribute("data-execution-state", "active");
	await expect.element(selected).not.toHaveAttribute("data-execution-state", "active");
});
