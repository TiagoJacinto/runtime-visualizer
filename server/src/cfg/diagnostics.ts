import * as path from "node:path";
import * as ts from "typescript";
import type { GraphDiagnostic, SourceLocation } from "./types.ts";

export type SourceProject = {
	readonly source: string;
	readonly filePath: string;
	readonly files?: Readonly<Record<string, string>>;
};

export function diagnoseProject({ source, filePath, files = {} }: SourceProject): GraphDiagnostic[] {
	const selectedPath = virtualPath(filePath);
	const sources = new Map<string, string>([[selectedPath, source]]);
	for (const [name, contents] of Object.entries(files)) sources.set(virtualPath(name), contents);
	const compilerOptions: ts.CompilerOptions = {
		allowJs: false,
		jsx: ts.JsxEmit.Preserve,
		module: ts.ModuleKind.CommonJS,
		moduleResolution: ts.ModuleResolutionKind.Node10,
		noEmit: true,
		target: ts.ScriptTarget.ESNext,
	};
	const host = ts.createCompilerHost(compilerOptions);
	const originalReadFile = host.readFile.bind(host);
	const defaultLib = path.normalize(ts.getDefaultLibFilePath(compilerOptions));
	const readCompilerFile = (fileName: string): string | undefined => fileName === defaultLib || path.basename(fileName).startsWith("lib.") ? originalReadFile(fileName) : undefined;
	host.readFile = (fileName) => sources.get(path.normalize(fileName)) ?? readCompilerFile(fileName);
	host.fileExists = (fileName) => sources.has(path.normalize(fileName)) || fileName === defaultLib || path.basename(fileName).startsWith("lib.");
	host.resolveModuleNames = (moduleNames, containingFile) => moduleNames.map((moduleName) => {
		if (moduleName.startsWith(".")) {
			const candidate = path.normalize(`${path.dirname(containingFile)}/${moduleName.endsWith(".ts") ? moduleName : `${moduleName}.ts`}`);
			if (sources.has(candidate)) return { resolvedFileName: candidate, extension: ts.Extension.Ts, isExternalLibraryImport: false };
		}
		return ts.resolveModuleName(moduleName, containingFile, compilerOptions, host).resolvedModule;
	});
	host.getSourceFile = (fileName, languageVersion) => {
		const contents = host.readFile(fileName);
		if (contents === undefined) return undefined;
		return ts.createSourceFile(fileName, contents, languageVersion, true, scriptKindFor(fileName));
	};
	const program = ts.createProgram([selectedPath], compilerOptions, host);
	const sourceFiles = new Set(program.getSourceFiles().map((file) => path.normalize(file.fileName)));
	const diagnostics: GraphDiagnostic[] = [];
	for (const candidate of program.getSourceFiles()) {
		const candidatePath = path.normalize(candidate.fileName);
		if (!sourceFiles.has(candidatePath) || !sources.has(candidatePath)) continue;
		const dependency = candidatePath === selectedPath ? undefined : displayPath(candidatePath, filePath);
		for (const diagnostic of program.getSyntacticDiagnostics(candidate)) {
			if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
			addDiagnostic(diagnostics, diagnostic, filePath, dependency, "Syntax is invalid");
		}
		for (const diagnostic of program.getSemanticDiagnostics(candidate)) {
			if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
			const reason = diagnostic.code === 2307 ? "Required dependency could not be resolved" : "Type checking failed";
			addDiagnostic(diagnostics, diagnostic, filePath, dependency, reason);
		}
		collectWithDiagnostics(candidate, filePath, dependency, diagnostics);
	}
	return diagnostics;
}

function addDiagnostic(diagnostics: GraphDiagnostic[], diagnostic: ts.Diagnostic, procedure: string, dependency: string | undefined, reason: string): void {
	const message = flatten(diagnostic.messageText);
	if (diagnostics.some((existing) => existing.dependency === dependency && existing.reason === reason && existing.message === message)) return;
	diagnostics.push({ procedure, ...(dependency === undefined ? {} : { dependency }), reason, message, ...(diagnostic.file === undefined ? {} : { location: location(diagnostic.file, diagnostic.start ?? 0, diagnostic.length ?? 0) }) });
}

function collectWithDiagnostics(file: ts.SourceFile, procedure: string, dependency: string | undefined, diagnostics: GraphDiagnostic[]): void {
	const visit = (node: ts.Node): void => {
		if (ts.isWithStatement(node)) diagnostics.push({ procedure, ...(dependency === undefined ? {} : { dependency }), reason: "With statement is unsupported", location: location(file, node.getStart(file), node.getWidth(file)) });
		ts.forEachChild(node, visit);
	};
	visit(file);
}

function virtualPath(filePath: string): string {
	const safeParts = filePath.split(/[\\/]/).filter((part) => part !== "" && part !== "." && part !== "..");
	return `/runtime-visualizer/${safeParts.join("/") || "inline.ts"}`;
}
function displayPath(candidate: string, selected: string): string {
	const requested = path.basename(candidate);
	return candidate === virtualPath(selected) ? selected : requested;
}
function scriptKindFor(filePath: string): ts.ScriptKind { return filePath.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS; }
function flatten(message: string | ts.DiagnosticMessageChain): string { return typeof message === "string" ? message : ts.flattenDiagnosticMessageText(message, " "); }
function location(file: ts.SourceFile, start: number, length: number): SourceLocation {
	const begin = file.getLineAndCharacterOfPosition(start);
	const end = file.getLineAndCharacterOfPosition(Math.min(file.getFullText().length, start + length));
	return { start: { line: begin.line + 1, column: begin.character + 1 }, end: { line: end.line + 1, column: end.character + 1 } };
}
