import * as ts from "typescript";
import type {
	CfgEdge,
	CfgNode,
	CfgNodeKind,
	ControlFlowGraph,
	ProcedureCfg,
	SourceLocation,
} from "./types.ts";

type AbruptKind = "return" | "throw" | "break" | "continue";
type AbruptFlow = { from: string; kind: AbruptKind; label?: string };
type NormalEdge = { from: string; label?: string };
type Flow = { entry?: string; normal: string[]; normalLabels?: Map<string, string>; normalEdges?: NormalEdge[]; abrupt: AbruptFlow[] };

type Breakable = {
	kind: "loop" | "switch";
	label?: string;
	breaks: string[];
};

type Loop = Breakable & { kind: "loop"; continueTarget: string };

type BuildContext = {
	breakables: Breakable[];
	loops: Loop[];
};

class GraphBuilder {
	readonly nodes: CfgNode[] = [];
	readonly edges: CfgEdge[] = [];
	private sequence = 0;

	constructor(readonly file: ts.SourceFile) {}

	node(kind: CfgNodeKind, label: string, source?: ts.Node, text = source?.getText(this.file).trim()): string {
		const id = `${kind}-${++this.sequence}`;
		this.nodes.push({
			id,
			kind,
			label,
			...(text === undefined ? {} : { text }),
			...(source === undefined ? {} : { location: location(this.file, source) }),
		});
		return id;
	}

	link(from: string, to: string, label?: string, kind: CfgEdge["kind"] = edgeKind(label)): void {
		if (this.edges.some((edge) => edge.from === from && edge.to === to && edge.label === label && edge.kind === kind)) return;
		this.edges.push({ from, to, ...(kind === undefined ? {} : { kind }), ...(label === undefined ? {} : { label }) });
	}
}

/** Build the file-scoped Procedure graph, retaining nested Procedure boundaries. */
export function analyseFileProcedure(source: string, filePath = "inline.ts"): ControlFlowGraph {
	const file = ts.createSourceFile(filePath, source, ts.ScriptTarget.ESNext, true, scriptKindFor(filePath));
	const selectedFunction = findSelectedFunction(file, filePath);
	const procedure = buildProcedure(file, selectedFunction?.body?.statements ?? file.statements, filePath);
	return { filePath, functions: [], procedures: [procedure] };
}

function buildProcedure(
	file: ts.SourceFile,
	statements: readonly ts.Statement[],
	name: string,
): ProcedureCfg {
	const builder = new GraphBuilder(file);
	const entry = builder.node("entry", "Entry");
	const flow = buildStatementList(file, builder, statements, emptyContext());
	const exit = builder.node("exit", "Exit");
	if (flow.entry !== undefined) builder.link(entry, flow.entry, undefined, "entry");
	else builder.link(entry, exit, undefined, "entry");
	connectNormal(builder, flow, exit);
	resolveAbrupt(builder, flow.abrupt, exit);
	return {
		name,
		nodes: builder.nodes,
		edges: builder.edges,
		entry,
		exit,
	};
}

function emptyContext(): BuildContext {
	return { breakables: [], loops: [] };
}

function connectNormal(builder: GraphBuilder, flow: Pick<Flow, "normal" | "normalLabels" | "normalEdges">, target: string): void {
	for (const source of flow.normal) builder.link(source, target, flow.normalLabels?.get(source));
	for (const edge of flow.normalEdges ?? []) builder.link(edge.from, target, edge.label);
}

function buildStatementList(
	file: ts.SourceFile,
	builder: GraphBuilder,
	statements: readonly ts.Statement[],
	context: BuildContext,
): Flow {
	let entry: string | undefined;
	let normal: string[] = [];
	let normalLabels = new Map<string, string>();
	let abrupt: AbruptFlow[] = [];
	let normalEdges: NormalEdge[] = [];
	for (const statement of statements) {
		const current = buildStatement(file, builder, statement, context);
		if (current.entry === undefined) continue;
		if (entry === undefined) entry = current.entry;
		connectNormal(builder, { normal, normalLabels, normalEdges }, current.entry);
		normal = current.normal;
		normalLabels = current.normalLabels ?? new Map<string, string>();
		normalEdges = current.normalEdges ?? [];
		abrupt = [...abrupt, ...current.abrupt];
	}
	return { entry, normal, normalLabels, normalEdges, abrupt };
}

function buildStatement(file: ts.SourceFile, builder: GraphBuilder, statement: ts.Statement, context: BuildContext): Flow {
	if (ts.isEmptyStatement(statement)) return emptyFlow();
	if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement) || ts.isExportDeclaration(statement)) return emptyFlow();
	if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || isDeclare(statement)) return emptyFlow();
	if (ts.isFunctionDeclaration(statement)) return emptyFlow();
	if (ts.isClassDeclaration(statement)) return buildClass(file, builder, statement, context);
	if (ts.isBlock(statement)) return buildStatementList(file, builder, statement.statements, context);
	if (ts.isExpressionStatement(statement)) return buildExpression(file, builder, statement.expression, context);
	if (ts.isVariableStatement(statement)) return buildVariable(file, builder, statement, context);
	if (ts.isReturnStatement(statement)) return abruptNode(builder, "return", statement, statementLabel(file, statement));
	if (ts.isThrowStatement(statement)) return abruptNode(builder, "throw", statement, statementLabel(file, statement));
	if (ts.isBreakStatement(statement)) return abruptNode(builder, "break", statement, statementLabel(file, statement), statement.label?.text);
	if (ts.isContinueStatement(statement)) return abruptNode(builder, "continue", statement, statementLabel(file, statement), statement.label?.text);
	if (ts.isIfStatement(statement)) return buildIf(file, builder, statement, context);
	if (ts.isWhileStatement(statement)) return buildWhile(file, builder, statement, context);
	if (ts.isDoStatement(statement)) return buildDoWhile(file, builder, statement, context);
	if (ts.isForStatement(statement)) return buildFor(file, builder, statement, context);
	if (ts.isForInStatement(statement) || ts.isForOfStatement(statement)) return buildForInOf(file, builder, statement, context);
	if (ts.isSwitchStatement(statement)) return buildSwitch(file, builder, statement, context);
	if (ts.isTryStatement(statement)) return buildTry(file, builder, statement, context);
	if (ts.isLabeledStatement(statement)) return buildLabeled(file, builder, statement, context);
	if (ts.isWithStatement(statement)) throw new Error("Cannot visualize a With statement in a control-flow graph.");
	return executableNode(builder, statement, statement.getText(file).trim());
}

function buildVariable(file: ts.SourceFile, builder: GraphBuilder, statement: ts.VariableStatement, context: BuildContext): Flow {
	const declarations = statement.declarationList.declarations;
	if (declarations.length > 0 && declarations.every((declaration) => declaration.initializer !== undefined && isNestedProcedure(declaration.initializer))) return emptyFlow();
	return executableNode(builder, statement, statement.getText(file).trim(), context);
}

function buildIf(file: ts.SourceFile, builder: GraphBuilder, statement: ts.IfStatement, context: BuildContext): Flow {
	const decision = builder.node("branch", statement.expression.getText(file).trim(), statement.expression);
	const thenFlow = buildStatement(file, builder, statement.thenStatement, context);
	if (thenFlow.entry !== undefined) builder.link(decision, thenFlow.entry, "true");
	const elseFlow = statement.elseStatement === undefined ? emptyFlow() : buildStatement(file, builder, statement.elseStatement, context);
	if (statement.elseStatement !== undefined && elseFlow.entry !== undefined) builder.link(decision, elseFlow.entry, "false");
	const normal = [...thenFlow.normal, ...elseFlow.normal];
	const normalLabels = new Map([...(thenFlow.normalLabels ?? new Map()), ...(elseFlow.normalLabels ?? new Map())]);
	const normalEdges = [...(thenFlow.normalEdges ?? []), ...(elseFlow.normalEdges ?? [])];
	if (thenFlow.entry === undefined) normalEdges.push({ from: decision, label: "true" });
	if (statement.elseStatement === undefined || elseFlow.entry === undefined) {
		normal.push(decision);
		normalLabels.set(decision, "false");
	}
	return { entry: decision, normal, normalLabels, normalEdges, abrupt: [...thenFlow.abrupt, ...elseFlow.abrupt] };
}

function buildWhile(file: ts.SourceFile, builder: GraphBuilder, statement: ts.WhileStatement, context: BuildContext, label?: string): Flow {
	const head = builder.node("branch", statement.expression.getText(file).trim(), statement.expression);
	const loop: Loop = { kind: "loop", label, breaks: [], continueTarget: head };
	context.breakables.push(loop);
	context.loops.push(loop);
	const body = buildStatement(file, builder, statement.statement, context);
	context.loops.pop();
	context.breakables.pop();
	if (body.entry !== undefined) builder.link(head, body.entry, "true");
	else builder.link(head, head, "true");
	connectNormal(builder, body, head);
	for (const jump of body.abrupt) {
		if (jump.kind === "continue" && matchesTarget(jump.label, loop.label)) builder.link(jump.from, head);
		else if (jump.kind === "break" && matchesTarget(jump.label, loop.label)) loop.breaks.push(jump.from);
	}
	const handled = body.abrupt.filter((jump) => (jump.kind === "continue" || jump.kind === "break") && matchesTarget(jump.label, loop.label));
	return { entry: head, normal: [head, ...loop.breaks], normalLabels: new Map([[head, "false"]]), abrupt: body.abrupt.filter((jump) => !handled.includes(jump)) };
}

function buildDoWhile(file: ts.SourceFile, builder: GraphBuilder, statement: ts.DoStatement, context: BuildContext, label?: string): Flow {
	const head = builder.node("branch", statement.expression.getText(file).trim(), statement.expression);
	const loop: Loop = { kind: "loop", label, breaks: [], continueTarget: head };
	context.breakables.push(loop);
	context.loops.push(loop);
	const body = buildStatement(file, builder, statement.statement, context);
	context.loops.pop();
	context.breakables.pop();
	if (body.entry !== undefined) {
		connectNormal(builder, body, head);
		builder.link(head, body.entry, "true");
	} else builder.link(head, head, "true");
	for (const jump of body.abrupt) {
		if (jump.kind === "continue" && matchesTarget(jump.label, loop.label)) builder.link(jump.from, head);
		else if (jump.kind === "break" && matchesTarget(jump.label, loop.label)) loop.breaks.push(jump.from);
	}
	const handled = body.abrupt.filter((jump) => (jump.kind === "continue" || jump.kind === "break") && matchesTarget(jump.label, loop.label));
	return { entry: body.entry ?? head, normal: [head, ...loop.breaks], normalLabels: new Map([[head, "false"]]), abrupt: body.abrupt.filter((jump) => !handled.includes(jump)) };
}

function buildFor(file: ts.SourceFile, builder: GraphBuilder, statement: ts.ForStatement, context: BuildContext, label?: string): Flow {
	const initializer = statement.initializer === undefined ? undefined : executableNode(builder, statement.initializer, statement.initializer.getText(file).trim());
	const head = builder.node("branch", statement.condition?.getText(file).trim() || "for (;;)", statement.condition);
	const update = statement.incrementor === undefined ? undefined : executableNode(builder, statement.incrementor, statement.incrementor.getText(file).trim());
	const loop: Loop = { kind: "loop", label, breaks: [], continueTarget: update?.entry ?? head };
	context.breakables.push(loop);
	context.loops.push(loop);
	const body = buildStatement(file, builder, statement.statement, context);
	context.loops.pop();
	context.breakables.pop();
	if (initializer?.entry !== undefined) builder.link(initializer.entry, head);
	if (body.entry !== undefined) builder.link(head, body.entry, "true");
	else if (statement.condition === undefined) builder.link(head, head, "repeat");
	else builder.link(head, head, "true");
	connectNormal(builder, body, update?.entry ?? head);
	if (update?.entry !== undefined) builder.link(update.entry, head);
	for (const jump of body.abrupt) {
		if (jump.kind === "continue" && matchesTarget(jump.label, loop.label)) builder.link(jump.from, loop.continueTarget);
		else if (jump.kind === "break" && matchesTarget(jump.label, loop.label)) loop.breaks.push(jump.from);
	}
	const handled = body.abrupt.filter((jump) => (jump.kind === "continue" || jump.kind === "break") && matchesTarget(jump.label, loop.label));
	const normal = statement.condition === undefined ? loop.breaks : [head, ...loop.breaks];
	return { entry: initializer?.entry ?? head, normal, normalLabels: statement.condition === undefined ? undefined : new Map([[head, "false"]]), abrupt: body.abrupt.filter((jump) => !handled.includes(jump)) };
}

function buildForInOf(file: ts.SourceFile, builder: GraphBuilder, statement: ts.ForInOrOfStatement, context: BuildContext, label?: string): Flow {
	const expression = statement.expression.getText(file);
	const suffix = ts.isForInStatement(statement) ? "keys" : "items";
	const head = builder.node("branch", `${expression} ${suffix}`, statement.expression);
	const loop: Loop = { kind: "loop", label, breaks: [], continueTarget: head };
	context.breakables.push(loop);
	context.loops.push(loop);
	const body = buildStatement(file, builder, statement.statement, context);
	context.loops.pop();
	context.breakables.pop();
	if (body.entry !== undefined) builder.link(head, body.entry, "next item");
	else builder.link(head, head, "next item");
	connectNormal(builder, body, head);
	for (const jump of body.abrupt) {
		if (jump.kind === "continue" && matchesTarget(jump.label, loop.label)) builder.link(jump.from, head);
		else if (jump.kind === "break" && matchesTarget(jump.label, loop.label)) loop.breaks.push(jump.from);
	}
	const handled = body.abrupt.filter((jump) => (jump.kind === "continue" || jump.kind === "break") && matchesTarget(jump.label, loop.label));
	return { entry: head, normal: [head, ...loop.breaks], normalLabels: new Map([[head, "iteration end"]]), abrupt: body.abrupt.filter((jump) => !handled.includes(jump)) };
}

function buildSwitch(file: ts.SourceFile, builder: GraphBuilder, statement: ts.SwitchStatement, context: BuildContext, label?: string): Flow {
	const dispatch = builder.node("switch", statement.expression.getText(file).trim(), statement.expression);
	const breaker: Breakable = { kind: "switch", label, breaks: [] };
	context.breakables.push(breaker);
	const clauses = statement.caseBlock.clauses.map((clause) => buildStatementList(file, builder, clause.statements, context));
	context.breakables.pop();
	const unhandled: AbruptFlow[] = [];
	for (let index = 0; index < clauses.length; index += 1) {
		const clause = statement.caseBlock.clauses[index];
		const flow = clauses[index];
		if (flow === undefined || clause === undefined) continue;
		const nextEntry = clauses.slice(index + 1).find((candidate) => candidate?.entry !== undefined)?.entry;
		const target = flow.entry ?? nextEntry;
		const outcome = ts.isCaseClause(clause) ? `case ${clause.expression.getText(file)}` : "default";
		if (target !== undefined) builder.link(dispatch, target, outcome, ts.isCaseClause(clause) ? "case" : "default");
		if (nextEntry !== undefined) connectNormal(builder, flow, nextEntry);
		for (const jump of flow.abrupt ?? []) {
			if (jump.kind === "break" && matchesTarget(jump.label, breaker.label)) breaker.breaks.push(jump.from);
			else unhandled.push(jump);
		}
	}
	const finalFlow = [...clauses].reverse().find((flow) => flow?.entry !== undefined);
	const hasDefault = statement.caseBlock.clauses.some((clause) => ts.isDefaultClause(clause));
	return {
		entry: dispatch,
		normal: [...(hasDefault ? [] : [dispatch]), ...breaker.breaks, ...(finalFlow?.normal ?? [])],
		abrupt: unhandled,
	};
}

function buildTry(file: ts.SourceFile, builder: GraphBuilder, statement: ts.TryStatement, context: BuildContext): Flow {
	const tryFlow = buildStatementList(file, builder, statement.tryBlock.statements, context);
	const catchFlow = statement.catchClause === undefined ? undefined : buildStatementList(file, builder, statement.catchClause.block.statements, context);
	const tryThrows = tryFlow.abrupt.filter((jump) => jump.kind === "throw");
	const tryOther = tryFlow.abrupt.filter((jump) => jump.kind !== "throw");
	if (catchFlow !== undefined && catchFlow.entry !== undefined) {
		for (const jump of tryThrows) builder.link(jump.from, catchFlow.entry);
	}
	const normalSources = [...tryFlow.normal, ...(catchFlow?.normal ?? [])];
	const abrupt = [
		...tryOther,
		...(catchFlow?.abrupt ?? []),
		...(catchFlow === undefined ? tryThrows : []),
	];
	const entry = tryFlow.entry ?? catchFlow?.entry;
	if (statement.finallyBlock === undefined) return { entry, normal: normalSources, abrupt };
	const finallyFlow = buildStatementList(file, builder, statement.finallyBlock.statements, context);
	if (finallyFlow.entry === undefined) return { entry, normal: normalSources, abrupt };
	for (const source of normalSources) builder.link(source, finallyFlow.entry);
	for (const jump of abrupt) builder.link(jump.from, finallyFlow.entry);
	if (finallyFlow.abrupt.length > 0) return { entry: entry ?? finallyFlow.entry, normal: [], abrupt: finallyFlow.abrupt };
	const resumed = abrupt.flatMap((jump) => finallyFlow.normal.map((from) => ({ ...jump, from })));
	return { entry: entry ?? finallyFlow.entry, normal: normalSources.length > 0 ? finallyFlow.normal : [], abrupt: resumed };
}

function buildLabeled(file: ts.SourceFile, builder: GraphBuilder, statement: ts.LabeledStatement, context: BuildContext): Flow {
	const label = statement.label.text;
	if (ts.isWhileStatement(statement.statement)) return buildWhile(file, builder, statement.statement, context, label);
	if (ts.isDoStatement(statement.statement)) return buildDoWhile(file, builder, statement.statement, context, label);
	if (ts.isForStatement(statement.statement)) return buildFor(file, builder, statement.statement, context, label);
	if (ts.isForInStatement(statement.statement) || ts.isForOfStatement(statement.statement)) return buildForInOf(file, builder, statement.statement, context, label);
	if (ts.isSwitchStatement(statement.statement)) return buildSwitch(file, builder, statement.statement, context, label);
	const breaker: Breakable = { kind: "switch", label, breaks: [] };
	context.breakables.push(breaker);
	const inner = buildStatement(file, builder, statement.statement, context);
	context.breakables.pop();
	const handled = inner.abrupt.filter((jump) => jump.kind === "break" && matchesTarget(jump.label, label));
	breaker.breaks.push(...handled.map((jump) => jump.from));
	return { entry: inner.entry, normal: [...inner.normal, ...breaker.breaks], abrupt: inner.abrupt.filter((jump) => !handled.includes(jump)) };
}

function buildClass(file: ts.SourceFile, builder: GraphBuilder, declaration: ts.ClassDeclaration, context: BuildContext): Flow {
	const parts: Flow[] = [];
	const heritage = declaration.heritageClauses?.flatMap((clause) => clause.types.map((type) => type.expression)) ?? [];
	for (const expression of heritage) parts.push(buildExpression(file, builder, expression, context));
	for (const member of declaration.members) {
		if (isDeclare(member)) continue;
		if (ts.isClassStaticBlockDeclaration(member)) {
			parts.push(buildStatementList(file, builder, member.body.statements, context));
			continue;
		}
		if (member.name !== undefined && ts.isComputedPropertyName(member.name)) {
			parts.push(buildExpression(file, builder, member.name.expression, context));
		}
		if (isStatic(member) && (ts.isPropertyDeclaration(member) || ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member))) {
			if (ts.isPropertyDeclaration(member)) parts.push(executableNode(builder, member, member.getText(file).trim().replace(/;$/, ""), context));
		}
	}
	return joinFlows(builder, parts);
}

function buildExpression(file: ts.SourceFile, builder: GraphBuilder, expression: ts.Expression, context: BuildContext): Flow {
	if (ts.isParenthesizedExpression(expression)) return buildExpression(file, builder, expression.expression, context);
	if (ts.isBinaryExpression(expression) && isShortCircuitOperator(expression.operatorToken.kind)) {
		const left = builder.node("branch", expression.left.getText(file).trim(), expression.left);
		const right = buildExpression(file, builder, expression.right, context);
		const shortCircuit = shortCircuitOutcome(expression.operatorToken.kind);
		if (right.entry !== undefined) builder.link(left, right.entry, shortCircuit.continue);
		return { entry: left, normal: [left, ...right.normal], normalLabels: new Map([[left, shortCircuit.stop], ...(right.normalLabels ?? new Map())]), abrupt: right.abrupt };
	}
	if (ts.isConditionalExpression(expression)) {
		const decision = builder.node("branch", expression.condition.getText(file).trim(), expression.condition);
		const whenTrue = buildExpression(file, builder, expression.whenTrue, context);
		const whenFalse = buildExpression(file, builder, expression.whenFalse, context);
		if (whenTrue.entry !== undefined) builder.link(decision, whenTrue.entry, "true");
		if (whenFalse.entry !== undefined) builder.link(decision, whenFalse.entry, "false");
		return { entry: decision, normal: [...whenTrue.normal, ...whenFalse.normal, ...(whenTrue.entry === undefined ? [decision] : []), ...(whenFalse.entry === undefined ? [decision] : [])], abrupt: [...whenTrue.abrupt, ...whenFalse.abrupt] };
	}
	if (isOptionalChain(expression)) {
		const optional = optionalChainParts(file, expression);
		const decision = builder.node("branch", optional.subject, expression);
		const call = builder.node("statement", optional.access, expression, optional.access);
		builder.link(decision, call, "not-nullish");
		return { entry: decision, normal: [decision, call], normalLabels: new Map([[decision, "nullish"]]), abrupt: [] };
	}
	return executableNode(builder, expression, expression.getText(file).trim(), context);
}

function executableNode(builder: GraphBuilder, source: ts.Node, label: string, _context?: BuildContext): Flow {
	const id = builder.node("statement", label, source, label);
	return { entry: id, normal: [id], abrupt: [] };
}

function abruptNode(builder: GraphBuilder, kind: AbruptKind, source: ts.Node, label: string, jumpLabel?: string): Flow {
	const id = builder.node("statement", label, source, label);
	return { entry: id, normal: [], abrupt: [{ from: id, kind, ...(jumpLabel === undefined ? {} : { label: jumpLabel }) }] };
}

function joinFlows(builder: GraphBuilder, flows: Flow[]): Flow {
	let entry: string | undefined;
	let normal: string[] = [];
	let normalLabels = new Map<string, string>();
	let normalEdges: NormalEdge[] = [];
	let abrupt: AbruptFlow[] = [];
	for (const flow of flows) {
		if (flow.entry === undefined) continue;
		if (entry === undefined) entry = flow.entry;
		connectNormal(builder, { normal, normalLabels, normalEdges }, flow.entry);
		normal = flow.normal;
		normalLabels = flow.normalLabels ?? new Map<string, string>();
		normalEdges = flow.normalEdges ?? [];
		abrupt = [...abrupt, ...flow.abrupt];
	}
	return { entry, normal, normalLabels, normalEdges, abrupt };
}

function resolveAbrupt(builder: GraphBuilder, abrupt: AbruptFlow[], exit: string): void {
	for (const jump of abrupt) builder.link(jump.from, exit);
}

function statementLabel(file: ts.SourceFile, statement: ts.Statement): string { return statement.getText(file).trim().replace(/;$/, ""); }
function emptyFlow(): Flow { return { entry: undefined, normal: [], abrupt: [] }; }
function matchesTarget(actual: string | undefined, expected: string | undefined): boolean { return actual === undefined || actual === expected; }
function isDeclare(node: ts.Node): boolean { return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) === true; }
function isStatic(node: ts.Node): boolean { return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) === true; }
function isNestedProcedure(node: ts.Node): boolean { return ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isClassExpression(node); }
function edgeKind(label?: string): CfgEdge["kind"] { return label === "true" ? "true" : label === "false" ? "false" : "next"; }
function scriptKindFor(filePath: string): ts.ScriptKind { return filePath.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS; }

function isShortCircuitOperator(kind: ts.SyntaxKind): boolean {
	return kind === ts.SyntaxKind.AmpersandAmpersandToken || kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken || kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken || kind === ts.SyntaxKind.BarBarEqualsToken || kind === ts.SyntaxKind.QuestionQuestionEqualsToken;
}
function shortCircuitOutcome(kind: ts.SyntaxKind): { continue: string; stop: string } {
	if (kind === ts.SyntaxKind.AmpersandAmpersandToken || kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken) return { continue: "truthy", stop: "falsy" };
	if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.BarBarEqualsToken) return { continue: "falsy", stop: "truthy" };
	return { continue: "nullish", stop: "not-nullish" };
}
function isOptionalChain(expression: ts.Expression): boolean {
	return (ts.isCallExpression(expression) && expression.questionDotToken !== undefined) || (ts.isPropertyAccessExpression(expression) && expression.questionDotToken !== undefined);
}
function optionalChainParts(file: ts.SourceFile, expression: ts.Expression): { subject: string; access: string } {
	if (ts.isCallExpression(expression)) {
		const subject = expression.expression.getText(file);
		return { subject: subject.replace(/\?\.$/, ""), access: `${subject.replace(/\?\.$/, "")}()` };
	}
	if (ts.isPropertyAccessExpression(expression)) {
		const subject = expression.expression.getText(file);
		return { subject, access: `${subject}.${expression.name.getText(file)}` };
	}
	return { subject: expression.getText(file), access: expression.getText(file) };
}

function findSelectedFunction(file: ts.SourceFile, filePath: string): ts.FunctionDeclaration | undefined {
	const requested = filePath.replace(/\.(tsx?|mts|cts)$/, "");
	let selected: ts.FunctionDeclaration | undefined;
	const visit = (node: ts.Node): void => {
		if (selected !== undefined) return;
		if (ts.isFunctionDeclaration(node) && node.name?.text === requested) selected = node;
		ts.forEachChild(node, visit);
	};
	visit(file);
	return selected;
}

function location(file: ts.SourceFile, node: ts.Node): SourceLocation {
	const start = file.getLineAndCharacterOfPosition(node.getStart(file));
	const end = file.getLineAndCharacterOfPosition(node.getEnd());
	return { start: { line: start.line + 1, column: start.character + 1 }, end: { line: end.line + 1, column: end.character + 1 } };
}
