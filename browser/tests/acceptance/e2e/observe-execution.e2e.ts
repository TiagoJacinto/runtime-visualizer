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
				{ id: "pause", kind: "statement", label: "await delay" },
				{ id: "work", kind: "statement", label: "work()" },
				{ id: "wait", kind: "statement", label: "wait()" },
				{ id: "exit", kind: "exit", label: "Exit" },
			],
			edges: [
				{ from: "entry", to: "prepare", kind: "entry" },
				{ from: "prepare", to: "ready" },
				{ from: "ready", to: "pause", label: "true", kind: "true" },
				{ from: "ready", to: "wait", label: "false", kind: "false" },
				{ from: "pause", to: "work" },
				{ from: "work", to: "exit" },
				{ from: "wait", to: "exit" },
			],
		}],
	},
};

test("Highlight the selected execution path and clear it at completion", async () => {
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		if (String(input) === "/api/execute") {
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					const encoder = new TextEncoder();
					const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
					send({ event: "node", data: { nodeId: "prepare" } });
					setTimeout(() => send({ event: "node", data: { nodeId: "ready" } }), 300);
					setTimeout(() => send({ event: "node", data: { nodeId: "pause" } }), 600);
					setTimeout(() => {
						send({ event: "node", data: { nodeId: "work" } });
						send({ event: "result", data: { status: "Succeeded" } });
						controller.close();
					}, 1_200);
				},
			});
			return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
		}
		return new Response(JSON.stringify(graph));
	});
	vi.stubGlobal("fetch", fetchMock);
	const screen = await render(createElement(App));
	await screen.getByRole("button", { name: "Visualize control flow" }).click();

	const preparation = screen.getByTestId("graph-node-prepare");
	const decision = screen.getByTestId("graph-node-ready");
	const pause = screen.getByTestId("graph-node-pause");
	const selected = screen.getByTestId("graph-node-work");
	const untaken = screen.getByTestId("graph-node-wait");
	await expect.element(preparation).toBeInTheDocument();
	await expect.element(untaken).toBeInTheDocument();
	await screen.getByRole("button", { name: "Run procedure" }).click();
	await expect.element(preparation).toHaveAttribute("data-execution-state", "active");
	await expect.element(decision).toHaveAttribute("data-execution-state", "active");
	await expect.element(pause).toHaveAttribute("data-execution-state", "active");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Execution running");
	await expect.element(selected).toHaveAttribute("data-execution-state", "active");
	await expect.element(untaken).not.toHaveAttribute("data-execution-state", "active");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Execution complete");
	await expect.element(preparation).not.toHaveAttribute("data-execution-state", "active");
	await expect.element(decision).not.toHaveAttribute("data-execution-state", "active");
	await expect.element(pause).not.toHaveAttribute("data-execution-state", "active");
	await expect.element(selected).not.toHaveAttribute("data-execution-state", "active");
});
