import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import * as path from "node:path";

export type FilesRoutesOptions = {
	/**
	 * Absolute path to the folder whose files should be listed.
	 * Resolved by the caller (settings loader or test override).
	 */
	readonly filesFolder: string;
};

/**
 * Recursively walks `abs` and returns every regular file as a
 * forward-slash path relative to `rel`. Symlinks and any
 * dot-prefixed directory are skipped — symlinks to keep the
 * listing predictable (and to prevent walking out of the
 * configured folder), dot-dirs because they conventionally hold
 * tool output that shouldn't be exposed as user-editable
 * source files.
 *
 * Order is "directories' contents before sibling files" within
 * each level (recursion emits the subtree first, then the file
 * at the current level).
 *
 * ponytail: O(n) syscalls via `readdir({ withFileTypes: true })`.
 * Adequate for project-sized folders; switch to a streaming
 * walker or memoised glob if folders exceed ~10k entries.
 *
 * ponytail: `isSymbolicLink() continue` — earlier prototype
 * followed links with a visited-set; skipping is cheaper and
 * removes the only path-traversal vector via this endpoint.
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
	return out;
}

const filesRoutes: FastifyPluginAsync<FilesRoutesOptions> = async (
	app,
	options,
) => {
	const folder = options.filesFolder;

	app.get("/", async (): Promise<string[]> => walk(folder, ""));
};

export default filesRoutes;
