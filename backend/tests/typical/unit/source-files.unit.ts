import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	isSourceFile,
	listSourceFiles,
} from "../../../src/source/source-files.js";

async function temporaryFolder(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "runtime-visualizer-source-"));
}

describe("source file module", () => {
	it("recognizes TypeScript source files only", () => {
		expect(isSourceFile("main.ts")).toBe(true);
		expect(isSourceFile("component.TSX")).toBe(true);
		expect(isSourceFile("README.md")).toBe(false);
		expect(isSourceFile("script.js")).toBe(false);
	});

	it("lists source files in stable order and skips hidden directories and links", async () => {
		const folder = await temporaryFolder();
		try {
			await mkdir(path.join(folder, "nested"));
			await mkdir(path.join(folder, ".hidden"));
			await writeFile(path.join(folder, "z.ts"), "");
			await writeFile(path.join(folder, "nested", "a.tsx"), "");
			await writeFile(path.join(folder, ".hidden", "ignored.ts"), "");
			await symlink(path.join(folder, "z.ts"), path.join(folder, "link.ts"));
			expect(await listSourceFiles(folder)).toEqual(["nested/a.tsx", "z.ts"]);
		} finally {
			await rm(folder, { recursive: true, force: true });
		}
	});
});
