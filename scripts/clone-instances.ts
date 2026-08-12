// @ts-nocheck
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const stagingRoot = mkdtempSync(join(tmpdir(), "runtime-visualizer-fallow-"));
const sourceRoots = ["backend/src", "browser/src"];
const ignored = ["components/generated", "assets", "_tmp_"];

function copySourceTree(sourceRoot: string): void {
	const sourcePath = join(projectRoot, sourceRoot);
	const targetPath = join(stagingRoot, sourceRoot);
	cpSync(sourcePath, targetPath, {
		recursive: true,
		filter: (path) => {
			const rel = relative(sourcePath, path);
			if (!rel) return true;
			if (ignored.some((part) => rel.includes(part))) return false;
			return (
				path.endsWith(".ts") ||
				path.endsWith(".tsx") ||
				(existsSync(path) && !path.includes("."))
			);
		},
	});
}

try {
	sourceRoots.forEach(copySourceTree);
	writeFileSync(
		join(stagingRoot, ".fallowrc.json"),
		JSON.stringify({
			duplicates: {
				mode: "mild",
				minTokens: 50,
				minLines: 5,
				minOccurrences: 2,
			},
			ignorePatterns: ["**/*.d.ts"],
		}),
	);

	const reportPath = join(projectRoot, "artifacts/fallow/dupes.json");
	mkdirSync(join(projectRoot, "artifacts/fallow"), { recursive: true });
	const result = spawnSync(
		join(projectRoot, "node_modules/.bin/fallow"),
		[
			"dupes",
			"--format",
			"json",
			"--pretty",
			"--no-cache",
			"--root",
			stagingRoot,
			"--output-file",
			reportPath,
		],
		{ encoding: "utf8" },
	);

	if (result.error) throw result.error;
	if (result.status !== 0) {
		process.stderr.write(result.stderr || result.stdout);
		throw new Error(`Fallow exited with status ${result.status ?? 1}`);
	}

	const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
		clone_groups?: Array<{ instances?: Array<{ file?: string }> }>;
	};
	const violations = (report.clone_groups ?? []).filter(
		(group) => (group.instances?.length ?? 0) > 3,
	);

	for (const group of violations) {
		console.error(
			`Clone group has ${group.instances?.length ?? 0} instances (maximum is 3):`,
		);
		for (const instance of group.instances ?? []) {
			console.error(`  ${instance.file ?? "unknown"}`);
		}
	}

	console.log(`Fallow clone groups: ${report.clone_groups?.length ?? 0}`);
	console.log(`Groups over maximum: ${violations.length}`);
	process.exitCode = violations.length === 0 ? 0 : 1;
} finally {
	rmSync(stagingRoot, { recursive: true, force: true });
}
