import * as path from "node:path";
import * as ts from "typescript";
import type { GraphDiagnostic, SourceLocation } from "./types.ts";

export type SourceProject = {
	readonly source: string;
	readonly filePath: string;
	readonly files?: Readonly<Record<string, string>>;
};

/** Compiler inputs that form part of an analysis workspace manifest. */
export const analysisCompilerOptions: Readonly<ts.CompilerOptions> = {
	allowJs: false,
	jsx: ts.JsxEmit.Preserve,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	noEmit: true,
	target: ts.ScriptTarget.ESNext,
};

/** Returns the saved source files loaded by the selected file's TypeScript Program. */
export function projectDependencyFiles({ source, filePath, files = {} }: SourceProject): readonly string[] {
	const { program, sources, selectedPath } = createProjectProgram({ source, filePath, files });
	const paths = new Set(program.getSourceFiles().map((file) => path.normalize(file.fileName)));
	return [...sources.keys()]
		.filter((name) => paths.has(name))
		.map((name) => name === selectedPath ? filePath : name.replace(/^\/runtime-visualizer\//, ""))
		.sort();
}

/** Diagnose only the selected Procedure and the dependencies it imports. */
export function diagnoseProject(project: SourceProject): GraphDiagnostic[] {
	const { program, sources, selectedPath } = createProjectProgram(project);
	const diagnostics: GraphDiagnostic[] = [];
	for (const file of program.getSourceFiles()) {
		const candidatePath = path.normalize(file.fileName);
		if (!sources.has(candidatePath)) continue;
		const dependency = candidatePath === selectedPath ? undefined : displayPath(candidatePath);
		for (const diagnostic of program.getSyntacticDiagnostics(file)) {
			if (diagnostic.category === ts.DiagnosticCategory.Error) addDiagnostic(diagnostics, diagnostic, project.filePath, dependency, "Syntax is invalid");
		}
		for (const diagnostic of program.getSemanticDiagnostics(file)) {
			if (diagnostic.category !== ts.DiagnosticCategory.Error || ignorableDiagnostic(diagnostic)) continue;
			const reason = diagnostic.code === 2307 ? "Required dependency could not be resolved" : "Type checking failed";
			addDiagnostic(diagnostics, diagnostic, project.filePath, dependency, reason);
		}
		collectWithDiagnostics(file, project.filePath, dependency, diagnostics);
	}
	return diagnostics;
}

function createProjectProgram({ source, filePath, files = {} }: SourceProject): {
	readonly program: ts.Program;
	readonly sources: Map<string, string>;
	readonly selectedPath: string;
} {
	const selectedPath = virtualPath(filePath);
	const sources = new Map<string, string>();
	for (const [name, contents] of Object.entries(files)) sources.set(virtualPath(name), contents);
	sources.set(selectedPath, source);
	const compilerOptions = analysisCompilerOptions;
	const host = ts.createCompilerHost(compilerOptions);
	const defaultLib = path.normalize(ts.getDefaultLibFilePath(compilerOptions));
	const defaultReadFile = host.readFile.bind(host);
	const readDefaultLib = (fileName: string): string | undefined =>
		fileName === defaultLib || path.basename(fileName).startsWith("lib.") ? defaultReadFile(fileName) : undefined;
	host.readFile = (fileName) => sources.get(path.normalize(fileName)) ?? readDefaultLib(fileName);
	host.fileExists = (fileName) => sources.has(path.normalize(fileName)) || readDefaultLib(fileName) !== undefined;
	host.resolveModuleNames = (moduleNames, containingFile) => moduleNames.map((moduleName) => {
		if (moduleName.startsWith(".")) {
			const exact = path.normalize(`${path.dirname(containingFile)}/${moduleName}`);
			if (sources.has(exact)) return { resolvedFileName: exact, extension: scriptKindFor(exact) === ts.ScriptKind.TSX ? ts.Extension.Tsx : ts.Extension.Ts, isExternalLibraryImport: false };
			for (const extension of [".ts", ".tsx", ".d.ts"]) {
				const candidate = path.normalize(`${path.dirname(containingFile)}/${moduleName}${extension}`);
				if (sources.has(candidate)) return { resolvedFileName: candidate, extension: extension === ".d.ts" ? ts.Extension.Dts : extension === ".tsx" ? ts.Extension.Tsx : ts.Extension.Ts, isExternalLibraryImport: false };
			}
		}
		return ts.resolveModuleName(moduleName, containingFile, compilerOptions, host).resolvedModule;
	});
	host.getSourceFile = (fileName, languageVersion) => {
		const contents = host.readFile(fileName);
		return contents === undefined ? undefined : ts.createSourceFile(fileName, contents, languageVersion, true, scriptKindFor(fileName));
	};
	return { program: ts.createProgram([selectedPath], compilerOptions, host), sources, selectedPath };
}
function ignorableDiagnostic(diagnostic: ts.Diagnostic): boolean {
	// Source snippets commonly call project-provided globals that are not part of the upload.
	// Keep unknown types and values visible: only an unresolved function callee is contextual.
	if (diagnostic.code !== 2304 && diagnostic.code !== 2552 || diagnostic.file === undefined || diagnostic.start === undefined) return false;
	const token = nodeAtPosition(diagnostic.file, diagnostic.start);
	return token !== undefined && ts.isCallExpression(token.parent) && token.parent.expression === token;
}

function nodeAtPosition(file: ts.SourceFile, position: number): ts.Node | undefined {
	let match: ts.Node | undefined;
	const visit = (node: ts.Node): void => {
		if (position < node.getStart(file) || position >= node.getEnd()) return;
		match = node;
		ts.forEachChild(node, visit);
	};
	visit(file);
	return match;
}

function addDiagnostic(diagnostics: GraphDiagnostic[], diagnostic: ts.Diagnostic, procedure: string, dependency: string | undefined, reason: string): void {
	const message = flatten(diagnostic.messageText);
	if (diagnostics.some((existing) => existing.dependency === dependency && existing.reason === reason && existing.message === message)) return;
	diagnostics.push({ procedure, ...(dependency === undefined ? {} : { dependency }), reason, message, ...(diagnostic.file === undefined ? {} : { location: location(diagnostic.file, diagnostic.start ?? 0, diagnostic.length ?? 0) }) });
}

function collectWithDiagnostics(file: ts.SourceFile, procedure: string, dependency: string | undefined, diagnostics: GraphDiagnostic[]): void {
	const visit = (node: ts.Node): void => {
		if (ts.isWithStatement(node) && !diagnostics.some((diagnostic) => diagnostic.dependency === dependency && diagnostic.reason === "With statement is unsupported" && diagnostic.location?.start.line === file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1)) {
			diagnostics.push({ procedure, ...(dependency === undefined ? {} : { dependency }), reason: "With statement is unsupported", location: location(file, node.getStart(file), node.getWidth(file)) });
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
}

function virtualPath(filePath: string): string {
	const parts = filePath.split(/[\\/]/).filter((part) => part !== "" && part !== "." && part !== "..");
	return `/runtime-visualizer/${parts.join("/") || "inline.ts"}`;
}
function displayPath(filePath: string): string { return path.basename(filePath); }
function scriptKindFor(filePath: string): ts.ScriptKind { return filePath.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS; }
function flatten(message: string | ts.DiagnosticMessageChain): string { return typeof message === "string" ? message : ts.flattenDiagnosticMessageText(message, " "); }
function location(file: ts.SourceFile, start: number, length: number): SourceLocation {
	const begin = file.getLineAndCharacterOfPosition(start);
	const end = file.getLineAndCharacterOfPosition(Math.min(file.getFullText().length, start + length));
	return { start: { line: begin.line + 1, column: begin.character + 1 }, end: { line: end.line + 1, column: end.character + 1 } };
}
