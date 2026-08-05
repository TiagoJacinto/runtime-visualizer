import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/app.ts";

type CfgResponse = {
	ok: boolean;
	file?: string;
	revision?: string;
	cfg?: { procedures?: Array<{ nodes: Array<{ label: string; kind: string }> }> };
	diagnostics?: Array<{ procedure: string; dependency?: string; reason: string }>;
};

describe("backend-owned CFG resource", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let folder: string | undefined;

	afterEach(async () => {
		await app?.close();
		if (folder !== undefined) await fs.rm(folder, { recursive: true, force: true });
	});

	async function start(files: Record<string, string>) {
		folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-cfg-"));
		for (const [file, source] of Object.entries(files)) {
			const destination = path.join(folder, file);
			await fs.mkdir(path.dirname(destination), { recursive: true });
			await fs.writeFile(destination, source);
		}
		app = await createApp({ filesFolder: folder });
	}

	it("analyzes selected backend-owned source and resolves local imports", async () => {
		await start({
			"main.ts": "import { helper } from './helper'; helper()",
			"helper.ts": "export function helper() { work() }",
		});

		const response = await app!.inject({ method: "GET", url: "/api/cfg?file=main.ts" });
		const body = JSON.parse(response.body) as CfgResponse;

		// result verification
		expect(response.statusCode).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.file).toBe("main.ts");
		expect(body.revision).toMatch(/^[a-f0-9]{64}$/);
		expect(body.cfg?.procedures?.[0]?.nodes).toContainEqual(
			expect.objectContaining({ label: "helper()", kind: "statement" }),
	);
	});

	it("rejects a required dependency with a complete diagnostic", async () => {
		await start({
			"main.ts": "import { count } from './count'; work(count)",
			"count.ts": "export const count: number = 'many'",
		});

		const response = await app!.inject({ method: "GET", url: "/api/cfg?file=main.ts" });
		const body = JSON.parse(response.body) as CfgResponse;

		// result verification
		expect(response.statusCode).toBe(422);
		expect(body.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					procedure: "main.ts",
					dependency: "count.ts",
					reason: "Type checking failed",
				}),
			]),
		);
		expect(body.cfg).toBeUndefined();
	});

	it("returns contextual imports only when requested", async () => {
		await start({
			"main.ts": "import { helper } from './helper'; helper()",
			"helper.ts": "export function helper() { work() }",
		});

		const response = await app!.inject({
			method: "GET",
			url: "/api/cfg?file=main.ts&showImports=true",
		});
		const body = JSON.parse(response.body) as CfgResponse;
		const nodes = body.cfg?.procedures?.[0]?.nodes ?? [];

		// result verification
		expect(response.statusCode).toBe(200);
		expect(nodes).toContainEqual(
			expect.objectContaining({ kind: "import", label: "import { helper } from './helper'" }),
	);
	});

	it("returns diagnostics and no partial graph for selected source errors", async () => {
		await start({ "broken.ts": "const count: number = 'many'; work()" });

		const response = await app!.inject({ method: "GET", url: "/api/cfg?file=broken.ts" });
		const body = JSON.parse(response.body) as CfgResponse;

		// result verification
		expect(response.statusCode).toBe(422);
		expect(body.ok).toBe(false);
		expect(body.file).toBe("broken.ts");
		expect(body.revision).toMatch(/^[a-f0-9]{64}$/);
		expect(body.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ procedure: "broken.ts", reason: "Type checking failed" }),
		]),
	);
		expect(body.cfg).toBeUndefined();
	});
});
