import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { coveragePolicy } from "../quality/coverage-policy.mjs";
import {
	describeCoverageRequirement,
	validateProcedureInputs,
	validateQualityPolicy,
} from "../quality/dynamic-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const failures = [];
const rootPackage = readJson("package.json");
const procedureInputsFile = readJson("quality/procedure-inputs.json");
let procedureInputs = {
	default: {
		importance: coveragePolicy.changedProductionCode.defaultImportance,
	},
	files: {},
	procedures: {},
};
try {
	validateQualityPolicy();
} catch (error) {
	failures.push(`quality/policy.json: ${error.message}`);
}
if (procedureInputsFile !== undefined) {
	try {
		procedureInputs = validateProcedureInputs(procedureInputsFile);
	} catch (error) {
		failures.push(`quality/procedure-inputs.json: ${error.message}`);
	}
}

function readJson(path) {
	try {
		return JSON.parse(readFileSync(resolve(root, path), "utf8"));
	} catch (error) {
		failures.push(`${path}: cannot read JSON (${error.message}).`);
		return undefined;
	}
}

function repoPath(path) {
	return relative(root, path).replaceAll("\\", "/");
}

function globExpression(glob) {
	let expression = "";
	for (let index = 0; index < glob.length; index += 1) {
		const character = glob[index];
		if (character === "*" && glob[index + 1] === "*" && glob[index + 2] === "/") {
			expression += "(?:.*/)?";
			index += 2;
			continue;
		}
		if (character === "*" && glob[index + 1] === "*") {
			expression += ".*";
			index += 1;
			continue;
		}
		if (character === "*") {
			expression += "[^/]*";
			continue;
		}
		expression += /[.+^${}()|[\]\\]/.test(character)
			? `\\${character}`
			: character;
	}
	return new RegExp(`^${expression}$`);
}

function matchesGlob(path, glob) {
	return globExpression(glob).test(path);
}

function filesIn(directory) {
	const absolute = resolve(root, directory);
	if (!existsSync(absolute)) return [];
	return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(absolute, entry.name);
		if (entry.isDirectory()) return filesIn(repoPath(path));
		return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
	});
}

function filesMatching(pattern) {
	if (!pattern.includes("*"))
		return existsSync(resolve(root, pattern)) ? [resolve(root, pattern)] : [];
	const firstWildcard = pattern.indexOf("*");
	const prefix = pattern.slice(0, firstWildcard);
	const directory = prefix.slice(0, prefix.lastIndexOf("/") + 1) || ".";
	return filesIn(directory).filter((path) =>
		matchesGlob(repoPath(path), pattern),
	);
}

function changedProductionLines() {
	const baseRef = process.env.QUALITY_BASE_SHA ?? "origin/main";
	let baseCommit;
	try {
		baseCommit = execFileSync("git", ["merge-base", baseRef, "HEAD"], {
			cwd: root,
			encoding: "utf8",
		}).trim();
	} catch {
		failures.push(`Cannot resolve QUALITY_BASE_SHA (${baseRef}) against HEAD.`);
		return new Map();
	}

	let diff;
	try {
		diff = execFileSync(
			"git",
			[
				"diff",
				"--unified=0",
				`${baseCommit}...HEAD`,
				"--",
				...coveragePolicy.changedProductionCode.productionRoots,
			],
			{ cwd: root, encoding: "utf8" },
		);
	} catch {
		failures.push(`Cannot read the production-code diff from ${baseCommit}.`);
		return new Map();
	}

	const changed = new Map();
	let path;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+++ b/")) {
			path = line.slice(6);
			continue;
		}
		if (line.startsWith("+++ ")) {
			path = undefined;
			continue;
		}
		if (!path || !line.startsWith("@@")) continue;
		const match = /\+(\d+)(?:,(\d+))?/.exec(line);
		if (!match) continue;
		const start = Number(match[1]);
		const count = Number(match[2] ?? 1);
		if (count === 0) continue;
		const lines = changed.get(path) ?? new Set();
		for (let offset = 0; offset < count; offset += 1) lines.add(start + offset);
		changed.set(path, lines);
	}
	return changed;
}

function overlaps(location, changedLines) {
	for (let line = location.start.line; line <= location.end.line; line += 1) {
		if (changedLines.has(line)) return true;
	}
	return false;
}

function isCoverageExcluded(path) {
	return coveragePolicy.exclusions.some((rule) => {
		const pathFromPackage = relative(dirname(rule.config), path).replaceAll(
			"\\",
			"/",
		);
		return matchesGlob(pathFromPackage, rule.pattern);
	});
}

function isChangedCoverageExcluded(path) {
	return coveragePolicy.changedCodeExclusions.some((rule) =>
		matchesGlob(repoPath(path), rule.pattern),
	);
}

function verifyRepositoryCoverage() {
	for (const [name, coveragePackage] of Object.entries(
		coveragePolicy.packages,
	)) {
		const summaryPath = coveragePackage.report.replace(
			"coverage-final.json",
			"coverage-summary.json",
		);
		if (!existsSync(resolve(root, summaryPath))) {
			failures.push(`${name}: missing ${summaryPath}; run bun run coverage.`);
			continue;
		}
		const summary = readJson(summaryPath);
		if (!summary) continue;
		for (const [metric, threshold] of Object.entries(
			coveragePackage.thresholds,
		)) {
			const actual = summary.total[metric].pct;
			if (actual < threshold)
				failures.push(
					`${name}: ${metric} coverage is ${actual}%, below ${threshold}%.`,
				);
		}
	}
}

function containsLocation(container, location) {
	return (
		container.start.line <= location.start.line &&
		container.end.line >= location.end.line
	);
}

function functionNameForLocation(coverage, location) {
	const candidates = Object.values(coverage.fnMap ?? {}).filter((fn) =>
		containsLocation(fn.loc, location),
	);
	candidates.sort(
		(left, right) =>
			left.loc.end.line -
			left.loc.start.line -
			(right.loc.end.line - right.loc.start.line),
	);
	return candidates[0]?.name;
}

function groupedCoverageEntries(coverage, entries, changedLines, path) {
	const groups = new Map();
	for (const [id, location] of entries) {
		if (!overlaps(location, changedLines)) continue;
		const functionName = functionNameForLocation(coverage, location);
		const procedureKey =
			functionName === undefined ? undefined : `${path}#${functionName}`;
		const scopedFunctionName =
			procedureKey !== undefined &&
			Object.hasOwn(procedureInputs.procedures, procedureKey)
				? functionName
				: undefined;
		const key = scopedFunctionName ?? "<file>";
		const group = groups.get(key) ?? {
			functionName: scopedFunctionName,
			entries: [],
		};
		group.entries.push([id, location]);
		groups.set(key, group);
	}
	return groups;
}

function requirementFor(path, functionName, branchCount) {
	return describeCoverageRequirement({
		path,
		functionName,
		branchCount,
		inputs: procedureInputs,
	});
}

function branchCountForGroup(coverage, changedLines, path, functionName) {
	const counts = new Map();
	for (const branch of Object.values(coverage.branchMap ?? {})) {
		if (!overlaps(branch.loc, changedLines)) continue;
		const rawFunctionName = functionNameForLocation(coverage, branch.loc);
		const procedureKey =
			rawFunctionName === undefined ? undefined : `${path}#${rawFunctionName}`;
		const scopedFunctionName =
			procedureKey !== undefined &&
			Object.hasOwn(procedureInputs.procedures, procedureKey)
				? rawFunctionName
				: undefined;
		const key = scopedFunctionName ?? "<file>";
		if (functionName !== undefined) {
			if (scopedFunctionName === functionName) {
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
			continue;
		}
		const rawKey = rawFunctionName ?? "<file>";
		counts.set(rawKey, (counts.get(rawKey) ?? 0) + 1);
	}
	return functionName === undefined
		? Math.max(0, ...counts.values())
		: (counts.get(functionName) ?? 0);
}

function reportGroupedCoverage({
	path,
	coverage,
	changedLines,
	entries,
	count,
	metric,
}) {
	const groups = groupedCoverageEntries(coverage, entries, changedLines, path);
	for (const group of groups.values()) {
		const branchCount = branchCountForGroup(
			coverage,
			changedLines,
			path,
			group.functionName,
		);
		const requirement = requirementFor(path, group.functionName, branchCount);
		const covered = group.entries.filter(([id]) => count[id] > 0).length;
		const percentage = (covered / group.entries.length) * 100;
		if (percentage < requirement.target) {
			const scope =
				group.functionName === undefined
					? "file"
					: `procedure ${group.functionName}`;
			failures.push(
				`${path} (${scope}): changed ${metric} are ${percentage.toFixed(2)}% covered; required ${requirement.target}% (importance ${requirement.evidence.importance}, branches ${branchCount}).`,
			);
		}
	}
}

function verifyChangedCoverage() {
	const changed = changedProductionLines();
	const coverageByPath = new Map();
	for (const [name, coveragePackage] of Object.entries(
		coveragePolicy.packages,
	)) {
		if (!existsSync(resolve(root, coveragePackage.report))) {
			failures.push(
				`${name}: missing ${coveragePackage.report}; run bun run coverage.`,
			);
			continue;
		}
		const report = readJson(coveragePackage.report);
		if (!report) continue;
		for (const coverage of Object.values(report))
			coverageByPath.set(repoPath(coverage.path), coverage);
	}

	for (const [path, changedLines] of changed) {
		if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
		if (isChangedCoverageExcluded(resolve(root, path))) continue;
		const coverage = coverageByPath.get(path);
		if (!coverage) {
			if (!isCoverageExcluded(path))
				failures.push(`${path}: changed production code has no coverage report.`);
			continue;
		}
		reportGroupedCoverage({
			path,
			coverage,
			changedLines,
			entries: Object.entries(coverage.statementMap),
			count: coverage.s,
			metric: "statements",
		});
	}
}

function verifyRequiredTestSuites() {
	const testScript = rootPackage?.scripts?.test ?? "";
	for (const suite of coveragePolicy.requiredTestSuites) {
		if (filesMatching(suite.files).length === 0) {
			failures.push(`${suite.name}: no test files match ${suite.files}.`);
		}
		if (!testScript.includes(`bun run ${suite.command}`)) {
			failures.push(
				`${suite.name}: ${suite.command} is not invoked by bun run test.`,
			);
		}
	}
}

function verifyLayerCoverageReports() {
	const layerScript = rootPackage?.scripts?.["coverage:layers"] ?? "";
	for (const layer of coveragePolicy.coverageReports) {
		if (!layerScript.includes(`bun run ${layer.command}`)) {
			failures.push(
				`${layer.name}: ${layer.command} is not invoked by bun run coverage:layers.`,
			);
		}
		if (!existsSync(resolve(root, layer.report))) {
			failures.push(`${layer.name}: missing ${layer.report}.`);
			continue;
		}
		const summary = readJson(layer.report);
		if (summary?.total.statements.total === 0) {
			failures.push(
				`${layer.name}: coverage report contains no executable statements.`,
			);
		}
	}
}

function verifyExclusions() {
	const rulesByConfig = new Map();
	for (const rule of coveragePolicy.exclusions) {
		if (!rule.reason || !rule.verification) {
			failures.push(
				`${rule.config}: every coverage exclusion needs a reason and verification.`,
			);
			continue;
		}
		if (
			rule.verification !== "not-executable" &&
			rule.verification !== "not-shipped" &&
			!coveragePolicy.requiredTestSuites.some(
				(suite) => suite.command === rule.verification,
			)
		) {
			failures.push(
				`${rule.config}: ${rule.pattern} references unknown verifier ${rule.verification}.`,
			);
		}
		const rules = rulesByConfig.get(rule.config) ?? [];
		rules.push(rule);
		rulesByConfig.set(rule.config, rules);
	}

	for (const [config, rules] of rulesByConfig) {
		const source = readFileSync(resolve(root, config), "utf8");
		const block = /exclude:\s*\[([\s\S]*?)\],\s*reporter:/.exec(source)?.[1];
		const configured = block
			? [...block.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]).sort()
			: [];
		const expected = rules.map((rule) => rule.pattern).sort();
		if (JSON.stringify(configured) !== JSON.stringify(expected)) {
			failures.push(
				`${config}: coverage exclusions must exactly match quality/coverage-policy.mjs.`,
			);
		}
		for (const rule of rules) {
			if (rule.requireMatch === false) continue;
			const pattern = `${dirname(config)}/${rule.pattern}`;
			if (filesMatching(pattern).length === 0) {
				failures.push(
					`${config}: exclusion ${rule.pattern} matches no source file.`,
				);
			}
		}
	}

	for (const coveragePackage of Object.values(coveragePolicy.packages)) {
		for (const path of coveragePackage.productionRoots.flatMap(filesIn)) {
			if (/\b(?:v8|c8|istanbul)\s+ignore\b/i.test(readFileSync(path, "utf8"))) {
				failures.push(
					`${repoPath(path)}: inline coverage-ignore directives are forbidden.`,
				);
			}
		}
	}
}

verifyRepositoryCoverage();
verifyChangedCoverage();
verifyRequiredTestSuites();
verifyLayerCoverageReports();
verifyExclusions();

if (failures.length > 0) {
	process.stderr.write(
		`Coverage policy failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`,
	);
	process.exit(1);
}
process.stdout.write("Coverage policy passed.\n");
