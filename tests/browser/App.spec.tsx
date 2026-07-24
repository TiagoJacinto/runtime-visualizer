import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import App from "../../src/App";

test("shows the visualized branch graph to the Operator", async () => {
	const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(JSON.stringify({
			ok: true,
			cfg: {
				procedures: [{
					nodes: [
						{ id: "entry", kind: "entry", label: "Entry" },
						{ id: "ready", kind: "branch", label: "ready" },
						{ id: "work", kind: "statement", label: "work()" },
						{ id: "wait", kind: "statement", label: "wait()" },
						{ id: "exit", kind: "exit", label: "Exit" },
					],
					edges: [
						{ from: "entry", to: "ready" },
						{ from: "ready", to: "work", label: "true" },
						{ from: "ready", to: "wait", label: "false" },
						{ from: "work", to: "exit" },
						{ from: "wait", to: "exit" },
					],
				}],
			},
		})),
	);

	try {
		const screen = await render(<App />);
		await screen.getByLabelText("Procedure source").fill("if (ready) { work() } else { wait() }");
		await screen.getByRole("button", { name: "Visualize control flow" }).click();
		await expect.element(screen.getByTestId("control-flow-graph")).toBeVisible();
		const nodes = screen.getByRole("list", { name: "Graph nodes" });
		await expect.element(nodes.getByText("ready", { exact: true })).toBeVisible();
		await expect.element(nodes.getByText("work()", { exact: true })).toBeVisible();
		await expect.element(nodes.getByText("wait()", { exact: true })).toBeVisible();
	} finally {
		fetchMock.mockRestore();
	}
});
