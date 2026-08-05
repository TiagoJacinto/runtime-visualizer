import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as ts from "typescript";
import { HttpError } from "../errors.ts";

export type ProcedureResource = {
	readonly id: string;
	readonly kind: "TopLevel" | "Function";
	readonly name: string | null;
	readonly label: string;
};

export type SourceResource = {
	readonly file: string;
	readonly source: string;
	readonly revision: string;
};

export function sourceRevision(source: string): string {
	return createHash("sha256").update(source).digest("hex");
}

/** Resolve an API file name while keeping it inside the configured folder. */
export function resolveSourcePath(
	filesFolder: string,
	requestedFile: string,
): string {
	const file = requestedFile.split("\\").join("/");
	const segments = file.split("/");
	if (
		file.length === 0 ||
		path.isAbsolute(file) ||
		/^[A-Za-z]:\//.test(file) ||
		segments.some((segment: string) => segment === "..")
	) {
		throw new HttpError(
			400,
			"Source path must stay inside the configured files folder.",
		);
	}
	const root = path.resolve(filesFolder);
	const candidate = path.resolve(root, file);
	const relative = path.relative(root, candidate);
	if (
		relative === "" ||
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new HttpError(
			400,
			"Source path must stay inside the configured files folder.",
		);
	}
	return candidate;
}

export function canonicalSourceFile(
	filesFolder: string,
	requestedFile: string,
): string {
	const candidate = resolveSourcePath(filesFolder, requestedFile);
	return path
		.relative(path.resolve(filesFolder), candidate)
		.split(path.sep)
		.join("/");
}

export async function readSource(
	filesFolder: string,
	requestedFile: string,
): Promise<SourceResource> {
	const file = canonicalSourceFile(filesFolder, requestedFile);
	const absolute = resolveSourcePath(filesFolder, file);
	const root = await fs.realpath(filesFolder).catch((error: unknown) => {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	});
	if (root === undefined) throw new HttpError(404, "Source file not found.");
	let realFile: string;
	try {
		realFile = await fs.realpath(absolute);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT")
			throw new HttpError(404, "Source file not found.");
		throw error;
	}
	const relativeRealFile = path.relative(root, realFile);
	if (
		relativeRealFile === ".." ||
		relativeRealFile.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relativeRealFile)
	) {
		throw new HttpError(
			400,
			"Source path must stay inside the configured files folder.",
		);
	}
	const entry = await fs.lstat(absolute);
	if (!entry.isFile() || entry.isSymbolicLink())
		throw new HttpError(404, "Source file not found.");
	const source = await fs.readFile(absolute, "utf8");
	return { file, source, revision: sourceRevision(source) };
}

export function discoverProcedures(
	source: string,
	file: string,
): ProcedureResource[] {
	const scriptKind = file.toLowerCase().endsWith(".tsx")
		? ts.ScriptKind.TSX
		: ts.ScriptKind.TS;
	const sourceFile = ts.createSourceFile(
		file,
		source,
		ts.ScriptTarget.ESNext,
		true,
		scriptKind,
	);
	const procedures: ProcedureResource[] = [
		{
			id: "top-level",
			kind: "TopLevel",
			name: null,
			label: `Top level (${file})`,
		},
	];
	const counts = new Map<string, number>();
	const functions: ts.FunctionDeclaration[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isFunctionDeclaration(node) &&
			node.name !== undefined &&
			node.body !== undefined
		)
			functions.push(node);
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	functions.sort((a, b) => a.getStart(sourceFile) - b.getStart(sourceFile));
	for (const declaration of functions) {
		const name = declaration.name?.text;
		if (name === undefined) continue;
		const count = (counts.get(name) ?? 0) + 1;
		counts.set(name, count);
		const suffix = count === 1 ? "" : `:${declaration.getStart(sourceFile)}`;
		procedures.push({
			id: `function:${name}${suffix}`,
			kind: "Function",
			name,
			label: `${name}()`,
		});
	}
	return procedures;
}
