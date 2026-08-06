import * as ts from "typescript";
import type { ProcedureResource } from "../../types.ts";

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
