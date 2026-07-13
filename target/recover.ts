// target/recover.ts
//
// Reads dist/functions.js.map (which was emitted with `inlineSources: true`),
// pulls out the embedded original source, writes it to dist/functions.recovered.ts,
// and asserts the recovered file is byte-for-byte identical to functions.ts.
//
// Run after `tsc -p target`:
//   bun run target/recover.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface SourceMap {
	version: number;
	sources: string[];
	sourcesContent?: string[];
	mappings: string;
	file?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const mapPath = resolve(here, "dist/functions.js.map");
const recoveredPath = resolve(here, "dist/functions.recovered.ts");
const originalPath = resolve(here, "functions.ts");

function fail(message: string): never {
	console.error(`❌ ${message}`);
	process.exit(1);
}

const mapRaw = readFileSync(mapPath, "utf8");
let parsed: SourceMap;
try {
	parsed = JSON.parse(mapRaw) as SourceMap;
} catch (err) {
	fail(
		`Could not parse ${mapPath} as JSON: ${
			err instanceof Error ? err.message : String(err)
		}`,
	);
}

if (!Array.isArray(parsed.sourcesContent) || parsed.sourcesContent.length === 0) {
	fail(
		`Source map at ${mapPath} has no sourcesContent. ` +
			`Make sure tsconfig has "inlineSources": true.`,
	);
}

const recovered = parsed.sourcesContent[0]!;
writeFileSync(recoveredPath, recovered, "utf8");

const original = readFileSync(originalPath, "utf8");

const recoveredBytes = Buffer.byteLength(recovered, "utf8");
const originalBytes = Buffer.byteLength(original, "utf8");

if (recoveredBytes !== originalBytes) {
	console.error(
		`❌ Byte-length mismatch: recovered=${recoveredBytes} original=${originalBytes}`,
	);
	process.exit(1);
}

if (recovered !== original) {
	// Find the first divergence for a useful diagnostic.
	let i = 0;
	while (i < recovered.length && i < original.length && recovered[i] === original[i]) {
		i++;
	}
	const ctx = recovered.slice(Math.max(0, i - 30), i + 30);
	const origCtx = original.slice(Math.max(0, i - 30), i + 30);
	console.error(
		`❌ Recovered file differs from original at byte ${i}\n` +
			`  recovered: …${JSON.stringify(ctx)}…\n` +
			`  original:  …${JSON.stringify(origCtx)}…`,
	);
	process.exit(1);
}

console.log(
	`✅ Round-trip OK — recovered file (${recoveredBytes} bytes) is byte-identical to ${originalPath}.`,
);