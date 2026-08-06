import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Recursively walks `abs` and returns every regular file as a
 * forward-slash path relative to `rel`. Symlinks and any dot-prefixed
 * directory are skipped — symlinks to keep the listing predictable
 * (and to prevent walking out of the configured folder), dot-dirs because
 * they conventionally hold tool output that shouldn't be exposed as
 * user-editable source files.
 *
 * Results are sorted by their relative forward-slash path so callers
 * receive one stable order independent of filesystem directory order.
 */
async function walk(abs: string, rel: string): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await fs.readdir(abs, { withFileTypes: true });
	} catch (err) {
		// Missing dir mid-walk (e.g. deleted between reads): skip the
		// subtree rather than failing the whole request.
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw err;
	}
	entries.sort((a, b) => {
		if (a.isDirectory() !== b.isDirectory()) {
			return a.isDirectory() ? -1 : 1;
		}
		return a.name.localeCompare(b.name);
	});
	const out: string[] = [];
	for (const entry of entries) {
		if (entry.isSymbolicLink()) continue;
		if (entry.isDirectory() && entry.name.startsWith(".")) continue;
		const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
		if (entry.isDirectory()) {
			out.push(...(await walk(path.join(abs, entry.name), childRel)));
		} else if (entry.isFile()) {
			out.push(childRel);
		}
	}
	return out.sort((left, right) => left.localeCompare(right));
}

export function isSourceFile(file: string): boolean {
	return /\.(?:ts|tsx)$/i.test(file);
}

export async function listSourceFiles(folder: string): Promise<string[]> {
	return walk(folder, "");
}
