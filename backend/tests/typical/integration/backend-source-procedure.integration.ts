import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/shared/infra/http/app.ts";

const source = `import { helper } from "./helper";

function first() { return helper(); }
function second() { return first(); }
`;

describe("backend-owned source and Procedure resources", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let folder: string | undefined;

	afterEach(async () => {
		await app?.close();
		if (folder !== undefined)
			await fs.rm(folder, { recursive: true, force: true });
		app = undefined;
		folder = undefined;
	});

	it("lists regular source files in deterministic order and excludes hidden directories and links", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.mkdir(path.join(folder, "nested"));
		await fs.mkdir(path.join(folder, ".hidden"));
		await fs.writeFile(path.join(folder, "z.ts"), "");
		await fs.writeFile(path.join(folder, ".private.ts"), "");
		await fs.writeFile(path.join(folder, "nested", "a.ts"), "");
		await fs.writeFile(path.join(folder, ".hidden", "secret.ts"), "");
		await fs.symlink(path.join(folder, "z.ts"), path.join(folder, "link.ts"));
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({ method: "GET", url: "/api/files" });

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual([".private.ts", "nested/a.ts", "z.ts"]);
	});

	it("returns an empty catalog when the configured folder is missing", async () => {
		folder = path.join(os.tmpdir(), `runtime-visualizer-missing-${Date.now()}`);
		app = await createApp({ filesFolder: folder });

		expect(
			(await app.inject({ method: "GET", url: "/api/files" })).json(),
		).toEqual([]);
	});

	it("discovers the top level and named functions in source order", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.writeFile(path.join(folder, "main.ts"), source);
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "GET",
			url: "/api/procedures?file=main.ts",
		});

		expect(response.statusCode).toBe(200);
		expect(response.json().procedures).toEqual([
			{
				id: "top-level",
				kind: "TopLevel",
				name: null,
				label: "Top level (main.ts)",
			},
			{
				id: "function:first",
				kind: "Function",
				name: "first",
				label: "first()",
			},
			{
				id: "function:second",
				kind: "Function",
				name: "second",
				label: "second()",
			},
		]);
	});

	it("reads source with a stable opaque revision", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.writeFile(path.join(folder, "main.ts"), source);
		app = await createApp({ filesFolder: folder });

		const first = await app.inject({
			method: "GET",
			url: "/api/source?file=main.ts",
		});
		const second = await app.inject({
			method: "GET",
			url: "/api/source?file=main.ts",
		});

		expect(first.statusCode).toBe(200);
		expect(first.json()).toEqual({
			file: "main.ts",
			source,
			revision: expect.any(String),
		});
		expect(second.json().revision).toBe(first.json().revision);
	});

	it("rejects paths outside the configured source repository", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "GET",
			url: "/api/source?file=../outside.ts",
		});

		expect(response.statusCode).toBe(400);
		expect(response.json()).toEqual({
			error: "Source path must stay inside the configured files folder.",
		});
	});

	it("preserves a missing function as an explicit diagnostic with available procedures", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		await fs.writeFile(path.join(folder, "main.ts"), "function prepare() {}");
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "GET",
			url: "/api/procedures?file=main.ts&name=missing",
		});

		expect(response.statusCode).toBe(200);
		expect(response.json().diagnostics).toEqual([
			{ procedure: "missing", reason: "Procedure was not found" },
		]);
		expect(
			response
				.json()
				.procedures.map((procedure: { name: string | null }) => procedure.name),
		).toEqual([null, "prepare"]);
	});

	it("reports a missing source file without exposing an arbitrary filesystem path", async () => {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
		app = await createApp({ filesFolder: folder });

		const response = await app.inject({
			method: "GET",
			url: "/api/procedures?file=missing.ts",
		});

		expect(response.statusCode).toBe(404);
		expect(response.json()).toEqual({ error: "Source file not found." });
	});
});
