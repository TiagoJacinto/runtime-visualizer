import { render } from "vitest-browser-react";
import { expect, test } from "vitest";

import App from "../../src/App";

test("renders the runtime visualizer heading", async () => {
	const screen = await render(<App />);

	await expect
		.element(screen.getByRole("heading", { name: "Runtime Visualizer" }))
		.toBeVisible();
});
