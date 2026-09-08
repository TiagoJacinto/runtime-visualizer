import * as ts from "typescript";
// These CFG builders are mutually recursive by design; declaration order follows the syntax tree.
// oxlint-disable eslint/no-use-before-define

import type {
  CfgEdge,
  CfgNode,
  CfgNodeKind,
  ControlFlowGraph,
  ProcedureCfg,
  SourceLocation,
} from "../../types.ts";

type AbruptKind = "return" | "throw" | "break" | "continue";
interface AbruptFlow {
  from: string;
  kind: AbruptKind;
  label?: string;
}
interface NormalEdge {
  from: string;
  label?: string;
}
interface Flow {
  entry?: string;
  normal: string[];
  normalLabels?: Map<string, string>;
  normalEdges?: NormalEdge[];
  abrupt: AbruptFlow[];
}
interface Breakable {
  kind: "loop" | "switch";
  label?: string;
  breaks: string[];
}
type Loop = Breakable & {
  kind: "loop";
  continueTarget: string;
};
interface BuildContext {
  breakables: Breakable[];
  loops: Loop[];
}
interface ShortCircuitOutcome {
  continue: string;
  stop: string;
}
interface OptionalChainParts {
  subject: string;
  access: string;
}
class GraphBuilder {
  readonly nodes: CfgNode[] = [];
  readonly edges: CfgEdge[] = [];
  private sequence = 0;
  readonly file: ts.SourceFile;
  constructor(file: ts.SourceFile) {
    this.file = file;
  }
  node(
    kind: CfgNodeKind,
    label: string,
    source?: ts.Node,
    text = source?.getText(this.file).trim()
  ): string {
    this.sequence += 1;
    const id = `${kind}-${this.sequence}`;
    if (source === undefined) {
      if (text === undefined) {
        this.nodes.push({ id, kind, label });
      } else {
        this.nodes.push({ id, kind, label, text });
      }
    } else {
      const nodeLocation = location(this.file, source);
      if (text === undefined) {
        this.nodes.push({ id, kind, label, location: nodeLocation });
      } else {
        this.nodes.push({ id, kind, label, location: nodeLocation, text });
      }
    }
    return id;
  }
  link(
    from: string,
    to: string,
    label?: string,
    kind: CfgEdge["kind"] = edgeKind(label)
  ): void {
    if (
      this.edges.some(
        (edge) =>
          edge.from === from &&
          edge.to === to &&
          edge.label === label &&
          edge.kind === kind
      )
    ) {
      return;
    }
    if (kind === undefined) {
      if (label === undefined) {
        this.edges.push({ from, to });
      } else {
        this.edges.push({ from, label, to });
      }
    } else if (label === undefined) {
      this.edges.push({ from, kind, to });
    } else {
      this.edges.push({ from, kind, label, to });
    }
  }
}
/** Build the file-scoped Procedure graph, retaining nested Procedure boundaries. */
export const analyseFileProcedure = (
  source: string,
  filePath = "inline.ts",
  options: {
    showImports?: boolean;
    functionName?: string;
  } = {}
): ControlFlowGraph => {
  const file = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.ESNext,
    true,
    scriptKindFor(filePath)
  );
  const selectedFunction = findSelectedFunction(file, options.functionName);
  const procedure = buildProcedure(
    file,
    selectedFunction?.body?.statements ?? file.statements,
    selectedFunction?.name?.text ?? filePath
  );
  if (options.showImports === true) {
    const imports = file.statements
      .filter(ts.isImportDeclaration)
      .map((statement) => {
        const label = statement.getText(file).trim().replace(/;$/u, "");
        return {
          id: `import-${statement.getStart(file)}`,
          kind: "import" as const,
          label,
          location: location(file, statement),
          text: label,
        };
      });
    return {
      filePath,
      functions: [],
      procedures: [{ ...procedure, nodes: [...imports, ...procedure.nodes] }],
    };
  }
  return { filePath, functions: [], procedures: [procedure] };
};
const buildProcedure = (
  file: ts.SourceFile,
  statements: readonly ts.Statement[],
  name: string
): ProcedureCfg => {
  const builder = new GraphBuilder(file);
  const entry = builder.node("entry", "Entry");
  const flow = buildStatementList(file, builder, statements, emptyContext());
  const exit = builder.node("exit", "Exit");
  if (flow.entry === undefined) {
    builder.link(entry, exit, undefined, "entry");
  } else {
    builder.link(entry, flow.entry, undefined, "entry");
  }
  connectNormal(builder, flow, exit);
  resolveAbrupt(builder, flow.abrupt, exit);
  return {
    edges: builder.edges,
    entry,
    exit,
    name,
    nodes: builder.nodes,
  };
};
const emptyContext = (): BuildContext => ({ breakables: [], loops: [] });
/** Statements that perform one runtime action without owning statement bodies. */
export const isLeafStatement = (statement: ts.Statement): boolean =>
  ts.isExpressionStatement(statement) ||
  ts.isVariableStatement(statement) ||
  ts.isReturnStatement(statement) ||
  ts.isThrowStatement(statement) ||
  ts.isBreakStatement(statement) ||
  ts.isContinueStatement(statement) ||
  ts.isDebuggerStatement(statement) ||
  ts.isEnumDeclaration(statement) ||
  ts.isExportAssignment(statement);
/** Statements whose evaluation chooses, repeats, or transfers control. */
export const isControlStatement = (statement: ts.Statement): boolean =>
  ts.isIfStatement(statement) ||
  ts.isDoStatement(statement) ||
  ts.isWhileStatement(statement) ||
  ts.isForStatement(statement) ||
  ts.isForInStatement(statement) ||
  ts.isForOfStatement(statement) ||
  ts.isSwitchStatement(statement) ||
  ts.isTryStatement(statement) ||
  ts.isWithStatement(statement);
/** Containers whose nested statements or initialization members perform runtime work. */
export const isContainerStatement = (statement: ts.Statement): boolean => {
  if (ts.isBlock(statement)) {
    return statement.statements.some(isExecutableStatement);
  }
  if (ts.isLabeledStatement(statement)) {
    return isExecutableStatement(statement.statement);
  }
  if (ts.isClassDeclaration(statement)) {
    return !isDeclare(statement) && hasExecutableClassInitialization(statement);
  }
  if (ts.isModuleDeclaration(statement)) {
    return !isDeclare(statement) && hasExecutableModuleBody(statement.body);
  }
  return false;
};
const hasExecutableClassInitialization = (
  declaration: ts.ClassDeclaration
): boolean => {
  if (declaration.heritageClauses?.some((clause) => clause.types.length > 0)) {
    return true;
  }
  return declaration.members.some((member) => {
    if (isDeclare(member)) {
      return false;
    }
    if (ts.isClassStaticBlockDeclaration(member)) {
      return member.body.statements.some(isExecutableStatement);
    }
    if (member.name !== undefined && ts.isComputedPropertyName(member.name)) {
      return true;
    }
    return isStatic(member) && ts.isPropertyDeclaration(member);
  });
};
const hasExecutableModuleBody = (body: ts.ModuleBody | undefined): boolean => {
  if (body === undefined) {
    return false;
  }
  if (ts.isModuleBlock(body)) {
    return body.statements.some(isExecutableStatement);
  }
  return ts.isModuleDeclaration(body) && isExecutableStatement(body);
};
/** A positive runtime-role whitelist; declarations and erased syntax are excluded. */
export const isExecutableStatement = (statement: ts.Statement): boolean =>
  isLeafStatement(statement) ||
  isControlStatement(statement) ||
  isContainerStatement(statement);
const connectNormal = (
  builder: GraphBuilder,
  flow: Pick<Flow, "normal" | "normalLabels" | "normalEdges">,
  target: string
): void => {
  for (const source of flow.normal) {
    builder.link(source, target, flow.normalLabels?.get(source));
  }
  for (const edge of flow.normalEdges ?? []) {
    builder.link(edge.from, target, edge.label);
  }
};
const buildStatementList = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statements: readonly ts.Statement[],
  context: BuildContext
): Flow => {
  let entry: string | undefined;
  let normal: string[] = [];
  let normalLabels = new Map<string, string>();
  const abrupt: AbruptFlow[] = [];
  let normalEdges: NormalEdge[] = [];
  for (const statement of statements) {
    const current = buildStatement(file, builder, statement, context);
    if (current.entry === undefined) {
      continue;
    }
    const {
      entry: currentEntry,
      normal: currentNormal,
      normalLabels: currentNormalLabels,
      normalEdges: currentNormalEdges,
      abrupt: currentAbrupt,
    } = current;
    if (entry === undefined) {
      entry = currentEntry;
    }
    connectNormal(builder, { normal, normalEdges, normalLabels }, currentEntry);
    normal = currentNormal;
    normalLabels = currentNormalLabels ?? new Map<string, string>();
    normalEdges = currentNormalEdges ?? [];
    abrupt.push(...currentAbrupt);
  }
  return { abrupt, entry, normal, normalEdges, normalLabels };
};
const buildStatement = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.Statement,
  context: BuildContext
): Flow => {
  if (!isExecutableStatement(statement)) {
    return emptyFlow();
  }
  if (ts.isEmptyStatement(statement)) {
    return emptyFlow();
  }
  if (
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement)
  ) {
    return emptyFlow();
  }
  if (
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    isDeclare(statement)
  ) {
    return emptyFlow();
  }
  if (ts.isFunctionDeclaration(statement)) {
    return emptyFlow();
  }
  if (ts.isClassDeclaration(statement)) {
    return buildClass(file, builder, statement, context);
  }
  if (ts.isBlock(statement)) {
    return buildStatementList(file, builder, statement.statements, context);
  }
  if (ts.isExpressionStatement(statement)) {
    return buildExpression(file, builder, statement.expression, context);
  }
  if (ts.isVariableStatement(statement)) {
    return buildVariable(file, builder, statement, context);
  }
  if (ts.isReturnStatement(statement)) {
    return abruptNode(
      builder,
      "return",
      statement,
      statementLabel(file, statement)
    );
  }
  if (ts.isThrowStatement(statement)) {
    return abruptNode(
      builder,
      "throw",
      statement,
      statementLabel(file, statement)
    );
  }
  if (ts.isBreakStatement(statement)) {
    return abruptNode(
      builder,
      "break",
      statement,
      statementLabel(file, statement),
      statement.label?.text
    );
  }
  if (ts.isContinueStatement(statement)) {
    return abruptNode(
      builder,
      "continue",
      statement,
      statementLabel(file, statement),
      statement.label?.text
    );
  }
  if (ts.isIfStatement(statement)) {
    return buildIf(file, builder, statement, context);
  }
  if (ts.isWhileStatement(statement)) {
    return buildWhile(file, builder, statement, context);
  }
  if (ts.isDoStatement(statement)) {
    return buildDoWhile(file, builder, statement, context);
  }
  if (ts.isForStatement(statement)) {
    return buildFor(file, builder, statement, context);
  }
  if (ts.isForInStatement(statement) || ts.isForOfStatement(statement)) {
    return buildForInOf(file, builder, statement, context);
  }
  if (ts.isSwitchStatement(statement)) {
    return buildSwitch(file, builder, statement, context);
  }
  if (ts.isTryStatement(statement)) {
    return buildTry(file, builder, statement, context);
  }
  if (ts.isLabeledStatement(statement)) {
    return buildLabeled(file, builder, statement, context);
  }
  if (ts.isWithStatement(statement)) {
    throw new Error(
      "Cannot visualize a With statement in a control-flow graph."
    );
  }
  return executableNode(builder, statement, statementLabel(file, statement));
};
const buildVariable = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.VariableStatement,
  context: BuildContext
): Flow => {
  const { declarations } = statement.declarationList;
  if (
    declarations.length > 0 &&
    declarations.every(
      (declaration) =>
        declaration.initializer !== undefined &&
        isNestedProcedure(declaration.initializer)
    )
  ) {
    return emptyFlow();
  }
  return executableNode(
    builder,
    statement,
    statement.getText(file).trim(),
    context
  );
};
const buildIf = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.IfStatement,
  context: BuildContext
): Flow => {
  const decision = builder.node(
    "branch",
    statement.expression.getText(file).trim(),
    statement.expression
  );
  const thenFlow = buildStatement(
    file,
    builder,
    statement.thenStatement,
    context
  );
  if (thenFlow.entry !== undefined) {
    builder.link(decision, thenFlow.entry, "true");
  }
  const elseFlow =
    statement.elseStatement === undefined
      ? emptyFlow()
      : buildStatement(file, builder, statement.elseStatement, context);
  if (statement.elseStatement !== undefined && elseFlow.entry !== undefined) {
    builder.link(decision, elseFlow.entry, "false");
  }
  const normal = [...thenFlow.normal, ...elseFlow.normal];
  const normalLabels = new Map([
    ...(thenFlow.normalLabels ?? new Map()),
    ...(elseFlow.normalLabels ?? new Map()),
  ]);
  const normalEdges = [
    ...(thenFlow.normalEdges ?? []),
    ...(elseFlow.normalEdges ?? []),
  ];
  if (thenFlow.entry === undefined) {
    normalEdges.push({ from: decision, label: "true" });
  }
  if (statement.elseStatement === undefined || elseFlow.entry === undefined) {
    normal.push(decision);
    normalLabels.set(decision, "false");
  }
  return {
    abrupt: [...thenFlow.abrupt, ...elseFlow.abrupt],
    entry: decision,
    normal,
    normalEdges,
    normalLabels,
  };
};
const buildWhile = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.WhileStatement,
  context: BuildContext,
  label?: string
): Flow => {
  const head = builder.node(
    "branch",
    statement.expression.getText(file).trim(),
    statement.expression
  );
  const loop: Loop = { breaks: [], continueTarget: head, kind: "loop", label };
  const body = buildLoopBody(file, builder, statement.statement, context, loop);
  if (body.entry === undefined) {
    builder.link(head, head, "true");
  } else {
    builder.link(head, body.entry, "true");
  }
  connectNormal(builder, body, head);
  const abrupt = resolveLoopJumps(builder, body.abrupt, loop, head);
  return {
    abrupt,
    entry: head,
    normal: [head, ...loop.breaks],
    normalLabels: new Map([[head, "false"]]),
  };
};
const buildDoWhile = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.DoStatement,
  context: BuildContext,
  label?: string
): Flow => {
  const head = builder.node(
    "branch",
    statement.expression.getText(file).trim(),
    statement.expression
  );
  const loop: Loop = { breaks: [], continueTarget: head, kind: "loop", label };
  const body = buildLoopBody(file, builder, statement.statement, context, loop);
  if (body.entry === undefined) {
    builder.link(head, head, "true");
  } else {
    connectNormal(builder, body, head);
    builder.link(head, body.entry, "true");
  }
  const abrupt = resolveLoopJumps(builder, body.abrupt, loop, head);
  return {
    abrupt,
    entry: body.entry ?? head,
    normal: [head, ...loop.breaks],
    normalLabels: new Map([[head, "false"]]),
  };
};
const buildFor = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.ForStatement,
  context: BuildContext,
  label?: string
): Flow => {
  const initializer =
    statement.initializer === undefined
      ? undefined
      : executableNode(
          builder,
          statement.initializer,
          statement.initializer.getText(file).trim()
        );
  const head = builder.node(
    "branch",
    statement.condition?.getText(file).trim() || "for (;;)",
    statement.condition
  );
  const update =
    statement.incrementor === undefined
      ? undefined
      : executableNode(
          builder,
          statement.incrementor,
          statement.incrementor.getText(file).trim()
        );
  const loop: Loop = {
    breaks: [],
    continueTarget: update?.entry ?? head,
    kind: "loop",
    label,
  };
  const body = buildLoopBody(file, builder, statement.statement, context, loop);
  if (initializer?.entry !== undefined) {
    builder.link(initializer.entry, head);
  }
  if (body.entry !== undefined) {
    builder.link(head, body.entry, "true");
  } else if (statement.condition === undefined) {
    builder.link(head, head, "repeat");
  } else {
    builder.link(head, head, "true");
  }
  connectNormal(builder, body, update?.entry ?? head);
  if (update?.entry !== undefined) {
    builder.link(update.entry, head);
  }
  const abrupt = resolveLoopJumps(
    builder,
    body.abrupt,
    loop,
    loop.continueTarget
  );
  const normal =
    statement.condition === undefined ? loop.breaks : [head, ...loop.breaks];
  return {
    abrupt,
    entry: initializer?.entry ?? head,
    normal,
    normalLabels:
      statement.condition === undefined
        ? undefined
        : new Map([[head, "false"]]),
  };
};
const buildForInOf = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.ForInOrOfStatement,
  context: BuildContext,
  label?: string
): Flow => {
  const expression = statement.expression.getText(file);
  const suffix = ts.isForInStatement(statement) ? "keys" : "items";
  const head = builder.node(
    "branch",
    `${expression} ${suffix}`,
    statement.expression
  );
  const loop: Loop = { breaks: [], continueTarget: head, kind: "loop", label };
  const body = buildLoopBody(file, builder, statement.statement, context, loop);
  if (body.entry === undefined) {
    builder.link(head, head, "next item");
  } else {
    builder.link(head, body.entry, "next item");
  }
  connectNormal(builder, body, head);
  const abrupt = resolveLoopJumps(builder, body.abrupt, loop, head);
  return {
    abrupt,
    entry: head,
    normal: [head, ...loop.breaks],
    normalLabels: new Map([[head, "iteration end"]]),
  };
};
const buildSwitch = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.SwitchStatement,
  context: BuildContext,
  label?: string
): Flow => {
  const dispatch = builder.node(
    "switch",
    statement.expression.getText(file).trim(),
    statement.expression
  );
  const breaker: Breakable = { breaks: [], kind: "switch", label };
  context.breakables.push(breaker);
  const clauses = statement.caseBlock.clauses.map((clause) =>
    buildStatementList(file, builder, clause.statements, context)
  );
  context.breakables.pop();
  const unhandled: AbruptFlow[] = [];
  for (let index = 0; index < clauses.length; index += 1) {
    const clause = statement.caseBlock.clauses[index];
    const flow = clauses[index];
    if (flow === undefined || clause === undefined) {
      continue;
    }
    const nextEntry = clauses
      .slice(index + 1)
      .find((candidate) => candidate?.entry !== undefined)?.entry;
    const target = flow.entry ?? nextEntry;
    const outcome = ts.isCaseClause(clause)
      ? `case ${clause.expression.getText(file)}`
      : "default";
    if (target !== undefined) {
      builder.link(
        dispatch,
        target,
        outcome,
        ts.isCaseClause(clause) ? "case" : "default"
      );
    }
    if (nextEntry !== undefined) {
      connectNormal(builder, flow, nextEntry);
    }
    for (const jump of flow.abrupt ?? []) {
      if (jump.kind === "break" && matchesTarget(jump.label, breaker.label)) {
        breaker.breaks.push(jump.from);
      } else {
        unhandled.push(jump);
      }
    }
  }
  const finalFlow = clauses.findLast((flow) => flow?.entry !== undefined);
  const hasDefault = statement.caseBlock.clauses.some((clause) =>
    ts.isDefaultClause(clause)
  );
  return {
    abrupt: unhandled,
    entry: dispatch,
    normal: [
      ...(hasDefault ? [] : [dispatch]),
      ...breaker.breaks,
      ...(finalFlow?.normal ?? []),
    ],
  };
};
const buildTry = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.TryStatement,
  context: BuildContext
): Flow => {
  const tryFlow = buildStatementList(
    file,
    builder,
    statement.tryBlock.statements,
    context
  );
  const catchFlow =
    statement.catchClause === undefined
      ? undefined
      : buildStatementList(
          file,
          builder,
          statement.catchClause.block.statements,
          context
        );
  const tryThrows = tryFlow.abrupt.filter((jump) => jump.kind === "throw");
  const tryOther = tryFlow.abrupt.filter((jump) => jump.kind !== "throw");
  if (catchFlow !== undefined && catchFlow.entry !== undefined) {
    for (const jump of tryThrows) {
      builder.link(jump.from, catchFlow.entry);
    }
  }
  const normalSources = [...tryFlow.normal, ...(catchFlow?.normal ?? [])];
  const abrupt = [
    ...tryOther,
    ...(catchFlow?.abrupt ?? []),
    ...(catchFlow === undefined ? tryThrows : []),
  ];
  const entry = tryFlow.entry ?? catchFlow?.entry;
  if (statement.finallyBlock === undefined) {
    return { abrupt, entry, normal: normalSources };
  }
  const finallyFlow = buildStatementList(
    file,
    builder,
    statement.finallyBlock.statements,
    context
  );
  if (finallyFlow.entry === undefined) {
    return { abrupt, entry, normal: normalSources };
  }
  for (const source of normalSources) {
    builder.link(source, finallyFlow.entry);
  }
  for (const jump of abrupt) {
    builder.link(jump.from, finallyFlow.entry);
  }
  if (finallyFlow.abrupt.length > 0) {
    return {
      abrupt: finallyFlow.abrupt,
      entry: entry ?? finallyFlow.entry,
      normal: [],
    };
  }
  const resumed = abrupt.flatMap((jump) =>
    finallyFlow.normal.map((from) => ({ ...jump, from }))
  );
  return {
    abrupt: resumed,
    entry: entry ?? finallyFlow.entry,
    normal: normalSources.length > 0 ? finallyFlow.normal : [],
  };
};
const buildLabeled = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.LabeledStatement,
  context: BuildContext
): Flow => {
  const label = statement.label.text;
  if (ts.isWhileStatement(statement.statement)) {
    return buildWhile(file, builder, statement.statement, context, label);
  }
  if (ts.isDoStatement(statement.statement)) {
    return buildDoWhile(file, builder, statement.statement, context, label);
  }
  if (ts.isForStatement(statement.statement)) {
    return buildFor(file, builder, statement.statement, context, label);
  }
  if (
    ts.isForInStatement(statement.statement) ||
    ts.isForOfStatement(statement.statement)
  ) {
    return buildForInOf(file, builder, statement.statement, context, label);
  }
  if (ts.isSwitchStatement(statement.statement)) {
    return buildSwitch(file, builder, statement.statement, context, label);
  }
  const breaker: Breakable = { breaks: [], kind: "switch", label };
  context.breakables.push(breaker);
  const inner = buildStatement(file, builder, statement.statement, context);
  context.breakables.pop();
  const handled = inner.abrupt.filter(
    (jump) => jump.kind === "break" && matchesTarget(jump.label, label)
  );
  breaker.breaks.push(...handled.map((jump) => jump.from));
  return {
    abrupt: inner.abrupt.filter((jump) => !handled.includes(jump)),
    entry: inner.entry,
    normal: [...inner.normal, ...breaker.breaks],
  };
};
const buildClass = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  declaration: ts.ClassDeclaration,
  context: BuildContext
): Flow => {
  const parts: Flow[] = [];
  const heritage =
    declaration.heritageClauses?.flatMap((clause) =>
      clause.types.map((type) => type.expression)
    ) ?? [];
  for (const expression of heritage) {
    parts.push(buildExpression(file, builder, expression, context));
  }
  for (const member of declaration.members) {
    if (isDeclare(member)) {
      continue;
    }
    if (ts.isClassStaticBlockDeclaration(member)) {
      parts.push(
        buildStatementList(file, builder, member.body.statements, context)
      );
      continue;
    }
    if (member.name !== undefined && ts.isComputedPropertyName(member.name)) {
      parts.push(
        buildExpression(file, builder, member.name.expression, context)
      );
    }
    if (isStatic(member) && ts.isPropertyDeclaration(member)) {
      parts.push(
        executableNode(
          builder,
          member,
          member.getText(file).trim().replace(/;$/u, ""),
          context
        )
      );
    }
  }
  return joinFlows(builder, parts);
};
const buildExpression = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  expression: ts.Expression,
  context: BuildContext
): Flow => {
  if (ts.isParenthesizedExpression(expression)) {
    return buildExpression(file, builder, expression.expression, context);
  }
  if (
    ts.isBinaryExpression(expression) &&
    isShortCircuitOperator(expression.operatorToken.kind)
  ) {
    const left = builder.node(
      "branch",
      expression.left.getText(file).trim(),
      expression.left
    );
    const right = buildExpression(file, builder, expression.right, context);
    const shortCircuit = shortCircuitOutcome(expression.operatorToken.kind);
    if (right.entry !== undefined) {
      builder.link(left, right.entry, shortCircuit.continue);
    }
    return {
      abrupt: right.abrupt,
      entry: left,
      normal: [left, ...right.normal],
      normalLabels: new Map([
        [left, shortCircuit.stop],
        ...(right.normalLabels ?? new Map()),
      ]),
    };
  }
  if (ts.isConditionalExpression(expression)) {
    const decision = builder.node(
      "branch",
      expression.condition.getText(file).trim(),
      expression.condition
    );
    const whenTrue = buildExpression(
      file,
      builder,
      expression.whenTrue,
      context
    );
    const whenFalse = buildExpression(
      file,
      builder,
      expression.whenFalse,
      context
    );
    if (whenTrue.entry !== undefined) {
      builder.link(decision, whenTrue.entry, "true");
    }
    if (whenFalse.entry !== undefined) {
      builder.link(decision, whenFalse.entry, "false");
    }
    return {
      abrupt: [...whenTrue.abrupt, ...whenFalse.abrupt],
      entry: decision,
      normal: [
        ...whenTrue.normal,
        ...whenFalse.normal,
        ...(whenTrue.entry === undefined ? [decision] : []),
        ...(whenFalse.entry === undefined ? [decision] : []),
      ],
    };
  }
  if (isOptionalChain(expression)) {
    const optional = optionalChainParts(file, expression);
    const decision = builder.node("branch", optional.subject, expression);
    const call = builder.node(
      "statement",
      optional.access,
      expression,
      optional.access
    );
    builder.link(decision, call, "not-nullish");
    return {
      abrupt: [],
      entry: decision,
      normal: [decision, call],
      normalLabels: new Map([[decision, "nullish"]]),
    };
  }
  return executableNode(
    builder,
    expression,
    expression.getText(file).trim(),
    context
  );
};
const executableNode = (
  builder: GraphBuilder,
  source: ts.Node,
  label: string,
  _context?: BuildContext
): Flow => {
  const id = builder.node("statement", label, source, label);
  return { abrupt: [], entry: id, normal: [id] };
};
const abruptNode = (
  builder: GraphBuilder,
  kind: AbruptKind,
  source: ts.Node,
  label: string,
  jumpLabel?: string
): Flow => {
  const id = builder.node("statement", label, source, label);
  const abrupt: AbruptFlow = { from: id, kind };
  if (jumpLabel === undefined) {
    return { abrupt: [abrupt], entry: id, normal: [] };
  }
  return {
    abrupt: [{ ...abrupt, label: jumpLabel }],
    entry: id,
    normal: [],
  };
};
const joinFlows = (builder: GraphBuilder, flows: Flow[]): Flow => {
  let entry: string | undefined;
  let normal: string[] = [];
  let normalLabels = new Map<string, string>();
  let normalEdges: NormalEdge[] = [];
  const abrupt: AbruptFlow[] = [];
  for (const flow of flows) {
    if (flow.entry === undefined) {
      continue;
    }
    const {
      entry: flowEntry,
      normal: flowNormal,
      normalLabels: flowNormalLabels,
      normalEdges: flowNormalEdges,
      abrupt: flowAbrupt,
    } = flow;
    if (entry === undefined) {
      entry = flowEntry;
    }
    connectNormal(builder, { normal, normalEdges, normalLabels }, flowEntry);
    normal = flowNormal;
    normalLabels = flowNormalLabels ?? new Map<string, string>();
    normalEdges = flowNormalEdges ?? [];
    abrupt.push(...flowAbrupt);
  }
  return { abrupt, entry, normal, normalEdges, normalLabels };
};
const resolveAbrupt = (
  builder: GraphBuilder,
  abrupt: AbruptFlow[],
  exit: string
): void => {
  for (const jump of abrupt) {
    builder.link(jump.from, exit);
  }
};
const statementLabel = (file: ts.SourceFile, statement: ts.Statement): string =>
  statement.getText(file).trim().replace(/;$/u, "");
const emptyFlow = (): Flow => ({ abrupt: [], entry: undefined, normal: [] });
const matchesTarget = (
  actual: string | undefined,
  expected: string | undefined
): boolean => actual === undefined || actual === expected;
const buildLoopBody = (
  file: ts.SourceFile,
  builder: GraphBuilder,
  statement: ts.Statement,
  context: BuildContext,
  loop: Loop
): Flow => {
  context.breakables.push(loop);
  context.loops.push(loop);
  const body = buildStatement(file, builder, statement, context);
  context.loops.pop();
  context.breakables.pop();
  return body;
};
const resolveLoopJumps = (
  builder: GraphBuilder,
  abrupt: AbruptFlow[],
  loop: Loop,
  continueTarget: string
): AbruptFlow[] => {
  const handled = abrupt.filter(
    (jump) =>
      (jump.kind === "continue" || jump.kind === "break") &&
      matchesTarget(jump.label, loop.label)
  );
  for (const jump of handled) {
    if (jump.kind === "continue") {
      builder.link(jump.from, continueTarget);
    } else {
      loop.breaks.push(jump.from);
    }
  }
  return abrupt.filter((jump) => !handled.includes(jump));
};
const isDeclare = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  ts
    .getModifiers(node)
    ?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) ===
    true;
const isStatic = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  ts
    .getModifiers(node)
    ?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) ===
    true;
const isNestedProcedure = (node: ts.Node): boolean =>
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isClassExpression(node);
const edgeKind = (label?: string): CfgEdge["kind"] => {
  if (label === "true") {
    return "true";
  }
  if (label === "false") {
    return "false";
  }
  return "next";
};
const scriptKindFor = (filePath: string): ts.ScriptKind =>
  filePath.toLowerCase().endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
const isShortCircuitOperator = (kind: ts.SyntaxKind): boolean =>
  kind === ts.SyntaxKind.AmpersandAmpersandToken ||
  kind === ts.SyntaxKind.BarBarToken ||
  kind === ts.SyntaxKind.QuestionQuestionToken ||
  kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
  kind === ts.SyntaxKind.BarBarEqualsToken ||
  kind === ts.SyntaxKind.QuestionQuestionEqualsToken;
const shortCircuitOutcome = (kind: ts.SyntaxKind): ShortCircuitOutcome => {
  if (
    kind === ts.SyntaxKind.AmpersandAmpersandToken ||
    kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
  ) {
    return { continue: "truthy", stop: "falsy" };
  }
  if (
    kind === ts.SyntaxKind.BarBarToken ||
    kind === ts.SyntaxKind.BarBarEqualsToken
  ) {
    return { continue: "falsy", stop: "truthy" };
  }
  return { continue: "nullish", stop: "not-nullish" };
};
const isOptionalChain = (expression: ts.Expression): boolean =>
  (ts.isCallExpression(expression) &&
    expression.questionDotToken !== undefined) ||
  (ts.isPropertyAccessExpression(expression) &&
    expression.questionDotToken !== undefined);
const optionalChainParts = (
  file: ts.SourceFile,
  expression: ts.Expression
): OptionalChainParts => {
  if (ts.isCallExpression(expression)) {
    const subject = expression.expression.getText(file);
    return {
      access: `${subject.replace(/\?\.$/u, "")}()`,
      subject: subject.replace(/\?\.$/u, ""),
    };
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const subject = expression.expression.getText(file);
    return { access: `${subject}.${expression.name.getText(file)}`, subject };
  }
  return {
    access: expression.getText(file),
    subject: expression.getText(file),
  };
};
const findSelectedFunction = (
  file: ts.SourceFile,
  functionName: string | undefined
): ts.FunctionDeclaration | undefined => {
  if (functionName === undefined || functionName.trim() === "") {
    return undefined;
  }
  const requested = functionName.trim();
  let selected: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (selected !== undefined) {
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === requested) {
      selected = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return selected;
};
const location = (file: ts.SourceFile, node: ts.Node): SourceLocation => {
  const start = file.getLineAndCharacterOfPosition(node.getStart(file));
  const end = file.getLineAndCharacterOfPosition(node.getEnd());
  return {
    end: { column: end.character + 1, line: end.line + 1 },
    start: { column: start.character + 1, line: start.line + 1 },
  };
};
