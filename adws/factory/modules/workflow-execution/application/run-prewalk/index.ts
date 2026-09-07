export type BuiltInPiTool =
  | "todo"
  | "read"
  | "grep"
  | "find"
  | "ls"
  | "bash"
  | "edit"
  | "write";
export interface ModelSelection {
  readonly model: string;
  readonly thinking?: string;
}
export interface PiToolResult {
  readonly name: BuiltInPiTool;
  readonly isError?: boolean;
}
export interface PiTurn {
  readonly toolResults: readonly PiToolResult[];
  readonly complete: boolean;
}
export interface PiSession {
  readonly identifier: string;
  runTurn(input: {
    model: ModelSelection;
    prompt: string;
    builtInTools: readonly BuiltInPiTool[];
  }): Promise<PiTurn>;
}
export interface PrewalkOptions {
  readonly prompt: string;
  readonly planningModel: ModelSelection;
  readonly implementationModel: ModelSelection;
  readonly builtInTools: readonly BuiltInPiTool[];
  readonly maxTurns?: number;
}
export interface PrewalkRun {
  readonly sessionIdentifier: string;
  readonly status: "HandedOff" | "CompletedWithoutHandoff";
  readonly planningModel: ModelSelection;
  readonly implementationModel?: ModelSelection;
  readonly handoffTool?: "edit" | "write";
}

const planningNudge =
  "Before implementation, deeply inspect the task and repository, then create or update a Todo list.";
const continuationNudge = "Continue the task now.";

export async function runPrewalk(
  session: PiSession,
  options: PrewalkOptions,
): Promise<PrewalkRun> {
  if (sameSelection(options.planningModel, options.implementationModel)) {
    await runWithoutHandoff(session, options);
    return completedWithoutHandoff(session, options);
  }
  let currentModel = options.planningModel;
  let todoSeen = !options.builtInTools.includes("todo");
  let handoffTool: "edit" | "write" | undefined;
  let prompt = `${options.prompt}\n\n${planningNudge}`;
  let turns = 0;
  while (true) {
    if (options.maxTurns !== undefined && turns >= options.maxTurns)
      throw new Error(
        `Prewalk budget exhausted after ${options.maxTurns} turns`,
      );
    turns++;
    const turn = await session.runTurn({
      model: currentModel,
      prompt,
      builtInTools: options.builtInTools,
    });
    todoSeen ||= turn.toolResults.some(
      (result) => result.name === "todo" && !result.isError,
    );
    if (!handoffTool && todoSeen)
      handoffTool = turn.toolResults.find(
        (result) =>
          (result.name === "edit" || result.name === "write") &&
          !result.isError,
      )?.name as "edit" | "write" | undefined;
    if (handoffTool) {
      if (currentModel === options.planningModel) {
        currentModel = options.implementationModel;
        prompt = continuationNudge;
        continue;
      }
      if (turn.complete)
        return {
          sessionIdentifier: session.identifier,
          status: "HandedOff",
          planningModel: options.planningModel,
          implementationModel: options.implementationModel,
          handoffTool,
        };
    } else if (turn.complete) return completedWithoutHandoff(session, options);
    prompt = continuationNudge;
  }
}

async function runWithoutHandoff(
  session: PiSession,
  options: PrewalkOptions,
): Promise<void> {
  let prompt = `${options.prompt}\n\n${planningNudge}`;
  let turns = 0;
  while (true) {
    if (options.maxTurns !== undefined && turns >= options.maxTurns)
      throw new Error(
        `Prewalk budget exhausted after ${options.maxTurns} turns`,
      );
    turns++;
    const turn = await session.runTurn({
      model: options.planningModel,
      prompt,
      builtInTools: options.builtInTools,
    });
    if (turn.complete) return;
    prompt = continuationNudge;
  }
}
function sameSelection(left: ModelSelection, right: ModelSelection) {
  return left.model === right.model && left.thinking === right.thinking;
}
function completedWithoutHandoff(
  session: PiSession,
  options: PrewalkOptions,
): PrewalkRun {
  return {
    sessionIdentifier: session.identifier,
    status: "CompletedWithoutHandoff",
    planningModel: options.planningModel,
  };
}
