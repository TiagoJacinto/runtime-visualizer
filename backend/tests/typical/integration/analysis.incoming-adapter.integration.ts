import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/shared/infra/http/app.js";

describe("analysis incoming adapter", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let folder: string | undefined;

	afterEach(async () => {
		await app?.close();
		if (folder !== undefined)
			await fs.rm(folder, { recursive: true, force: true });
		app = undefined;
		folder = undefined;
	});

	it("returns a revision-consistent snapshot for a valid saved file", async () => {
		folder = await fs.mkdtemp(
			path.join(os.tmpdir(), "runtime-visualizer-"),
		);
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"function greet() { return 1; }\n",
		);
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "GET",
			url: "/api/analysis?file=main.ts&name=greet",
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body).toHaveProperty("file", "main.ts");
		expect(body).toHaveProperty("revision");
		expect(typeof body.revision).toBe("string");
		expect(body).toHaveProperty("source");
		expect(typeof body.source).toBe("string");
		expect(body).toHaveProperty("procedure");
		expect(body.procedure).toHaveProperty("name", "greet");
		expect(body.procedure).toHaveProperty("kind", "Function");
		expect(body).toHaveProperty("procedures");
		expect(Array.isArray(body.procedures)).toBe(true);
		expect(body.procedures.length).toBeGreaterThanOrEqual(1);
		expect(body).toHaveProperty("cfg");
		expect(body.cfg).not.toBeNull();
		expect(body.cfg).toHaveProperty("procedures");
		expect(body).toHaveProperty("diagnostics");
		expect(Array.isArray(body.diagnostics)).toBe(true);
	});

	it("returns a 422 with source context when diagnostics are present", async () => {
		folder = await fs.mkdtemp(
			path.join(os.tmpdir(), "runtime-visualizer-"),
		);
		await fs.writeFile(
			path.join(folder, "broken.ts"),
			"function broken() { invalid syntax here }}\n",
		);
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "GET",
			url: "/api/analysis?file=broken.ts",
		});

		expect(response.statusCode).toBe(422);
		const body = response.json();
		expect(body).toHaveProperty("error", "Analysis failed");
		expect(body).toHaveProperty("file", "broken.ts");
		expect(body).toHaveProperty("revision");
		expect(body).toHaveProperty("source");
		expect(typeof body.source).toBe("string");
		expect(body).toHaveProperty("procedures");
		expect(Array.isArray(body.procedures)).toBe(true);
		expect(body).toHaveProperty("diagnostics");
		expect(Array.isArray(body.diagnostics)).toBe(true);
		expect(body.diagnostics.length).toBeGreaterThan(0);
		expect(body).not.toHaveProperty("cfg");
	});

	it("defaults to Top level Procedure when no name is given", async () => {
		folder = await fs.mkdtemp(
			path.join(os.tmpdir(), "runtime-visualizer-"),
		);
		await fs.writeFile(
			path.join(folder, "app.ts"),
			"const x = 1;\n",
		);
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "GET",
			url: "/api/analysis?file=app.ts",
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.procedure).toHaveProperty("kind", "TopLevel");
		expect(body.procedure).toHaveProperty("name", null);
	});

	it("serves revision history and validates its scope query", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.writeFile(path.join(folder, "main.ts"), "function run() { return 1; }\\n");
		app = await createApp({ filesFolder: folder });
		const analysis = await app.inject({ method: "GET", url: "/api/analysis?file=main.ts&name=run&showImports=true" });
		const analysisBody = analysis.json() as { revision: string; procedureId: string };
		const revision = analysisBody.revision;
		const procedureId = analysisBody.procedureId;
		const history = await app.inject({ method: "GET", url: `/api/analysis/revisions?file=main.ts&procedureId=${procedureId}` });
		expect(history.statusCode).toBe(200);
		expect(history.json().revisions).toHaveLength(1);
		const historical = await app.inject({ method: "GET", url: `/api/analysis?file=main.ts&procedureId=${procedureId}&revision=${revision}` });
		expect(historical.statusCode).toBe(200);
		expect(historical.json().revision).toBe(revision);
		const invalid = await app.inject({ method: "GET", url: "/api/analysis/revisions?file=main.ts" });
		expect(invalid.statusCode).toBe(400);
		const missingProcedure = await app.inject({ method: "GET", url: `/api/analysis?file=main.ts&revision=${revision}` });
		expect(missingProcedure.statusCode).toBe(404);
		const invalidName = await app.inject({ method: "GET", url: "/api/analysis?file=main.ts&name=not-valid%20name" });
		expect(invalidName.statusCode).toBe(400);
	});

	it("returns 400 for a missing file query parameter", async () => {
		folder = await fs.mkdtemp(
			path.join(os.tmpdir(), "runtime-visualizer-"),
		);
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"function f() {}\n",
		);
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "GET",
			url: "/api/analysis",
		});

		expect(response.statusCode).toBe(400);
		const body = response.json();
		expect(body).toHaveProperty("error");
	});

	it("uses the transitive dependency manifest as the revision boundary", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.writeFile(path.join(folder, "main.ts"), "import { value } from './dependency'; function run() { return value; }\n");
		await fs.writeFile(path.join(folder, "dependency.ts"), "export const value = 1;\n");
		await fs.writeFile(path.join(folder, "unrelated.ts"), "export const unrelated = 1;\n");
		app = await createApp({ filesFolder: folder });

		const first = await app.inject({ method: "GET", url: "/api/analysis?file=main.ts&name=run" });
		await fs.writeFile(path.join(folder, "unrelated.ts"), "export const unrelated = 2;\n");
		const afterUnrelatedChange = await app.inject({ method: "GET", url: "/api/analysis?file=main.ts&name=run" });
		await fs.writeFile(path.join(folder, "dependency.ts"), "export const value = 2;\n");
		const afterDependencyChange = await app.inject({ method: "GET", url: "/api/analysis?file=main.ts&name=run" });

		expect(first.statusCode).toBe(200);
		expect(afterUnrelatedChange.statusCode).toBe(200);
		expect(afterDependencyChange.statusCode).toBe(200);
		expect(afterUnrelatedChange.json().revision).toBe(first.json().revision);
		expect(afterDependencyChange.json().revision).not.toBe(first.json().revision);
	}, 30_000);

	it("returns a consistent revision when queried twice", async () => {
		folder = await fs.mkdtemp(
			path.join(os.tmpdir(), "runtime-visualizer-"),
		);
		await fs.writeFile(
			path.join(folder, "main.ts"),
			"function stable() { return 42; }\n",
		);
		app = await createApp({ filesFolder: folder });

		const first = await app.inject({
			method: "GET",
			url: "/api/analysis?file=main.ts&name=stable",
		});
		const second = await app.inject({
			method: "GET",
			url: "/api/analysis?file=main.ts&name=stable",
		});

		expect(first.statusCode).toBe(200);
		expect(second.statusCode).toBe(200);
		const a = first.json();
		const b = second.json();
		expect(a.revision).toBe(b.revision);
		expect(a.source).toBe(b.source);
	});
});
