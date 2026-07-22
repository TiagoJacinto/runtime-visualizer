import * as ts from "typescript";
import type { CfgEdge, CfgNode, ControlFlowGraph, SourceLocation } from "./types.ts";

/** Builds the file-scoped Procedure graph: top-level runtime statements only. */
export function analyseFileProcedure(source: string, filePath = "inline.ts"): ControlFlowGraph {
	const file = ts.createSourceFile(filePath, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
	const nodes: CfgNode[] = [{ id: "entry", kind: "entry", label: "Entry" }];
	const edges: CfgEdge[] = [];
	const executable = file.statements.filter(isExecutableStatement);
	let previous = "entry";
	for (const statement of executable) {
		const id = `statement-${nodes.length - 1}`;
		const text = statement.getText(file).trim();
		nodes.push({ id, kind: "statement", label: text, text, location: location(file, statement) });
		edges.push({ from: previous, to: id, kind: previous === "entry" ? "entry" : "next" });
		previous = id;
	}
	nodes.push({ id: "exit", kind: "exit", label: "Exit" });
	edges.push({ from: previous, to: "exit", kind: "next" });
	return { filePath, functions: [], procedures: [{ name: filePath, nodes, edges, entry: "entry", exit: "exit" }] };
}

function isExecutableStatement(statement: ts.Statement): boolean {
	return !(
		ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement) ||
		ts.isExportDeclaration(statement) || ts.isInterfaceDeclaration(statement) ||
		ts.isTypeAliasDeclaration(statement) || ts.isModuleDeclaration(statement) ||
		ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) ||
		ts.isEmptyStatement(statement)
	);
}

function location(file: ts.SourceFile, node: ts.Node): SourceLocation {
	const start = file.getLineAndCharacterOfPosition(node.getStart(file));
	const end = file.getLineAndCharacterOfPosition(node.getEnd());
	return {
		start: { line: start.line + 1, column: start.character + 1 },
		end: { line: end.line + 1, column: end.character + 1 },
	};
}
