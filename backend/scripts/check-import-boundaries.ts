import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../src",
);
const allowedBarrels = new Set(["index.ts", "http.ts"]);
const importPattern =
	/(?:import|export)\s+(?:type\s+)?(?:[^"']*?from\s+)?["'](\.[^"']+)["']/g;

function filesIn(directory: string): string[] {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) return filesIn(entryPath);
		return entry.name.endsWith(".ts") ? [entryPath] : [];
	});
}

function boundaryRoot(filePath: string): string | undefined {
	const relative = path.relative(srcDir, filePath).split(path.sep);
	if (relative[0] === "modules" && relative[1]) {
		return path.join(srcDir, "modules", relative[1]);
	}
	if (relative[0] === "shared") return path.join(srcDir, "shared");
	return undefined;
}

function resolveImport(
	fromFile: string,
	specifier: string,
): string | undefined {
	const base = path.resolve(path.dirname(fromFile), specifier);
	const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
	return candidates.find((candidate) => fs.existsSync(candidate));
}

const violations: string[] = [];
for (const filePath of filesIn(srcDir)) {
	const source = fs.readFileSync(filePath, "utf8");
	for (const match of source.matchAll(importPattern)) {
		const specifier = match[1];
		if (!specifier) continue;
		const target = resolveImport(filePath, specifier);
		const fromRoot = boundaryRoot(filePath);
		const targetRoot = target ? boundaryRoot(target) : undefined;
		if (!target || !fromRoot || !targetRoot || fromRoot === targetRoot)
			continue;
		if (!allowedBarrels.has(path.basename(target))) {
			violations.push(
				`${path.relative(process.cwd(), filePath)} -> ${specifier}`,
			);
		}
	}
}

if (violations.length > 0) {
	console.error(
		"Deep cross-module imports are not allowed. Import from a module barrel:",
	);
	for (const violation of violations) console.error(`- ${violation}`);
	process.exit(1);
}

console.log("Import boundary check passed.");
