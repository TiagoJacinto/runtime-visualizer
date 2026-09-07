import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BudgetExhaustedError } from "../../domain/budget";
import type { PhaseDefinition, PhaseRecord } from "../../domain/phase";
import type {
  Artifact,
  EvidenceEntry,
  EvidenceManifest,
  IntegrationDecision,
  InvocationResult,
  PrimitiveAdapter,
  PrimitiveCallOptions,
  PrimitiveFunction,
  PrimitiveType,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowExecutionRequest,
  WorkflowFailure,
  WorkflowRun,
} from "../../domain/workflow";
import type { ArtifactStorePort } from "../../ports/artifact-store";
import type { AgentRuntimePort } from "../../ports/agent-runtime";
import type { HumanGatePort } from "../../ports/human-gate";
import type {
  CommandRequest,
  CommandResult,
  CommandRunnerPort,
} from "../../ports/command-runner";
import type { TraceEvent, TraceSinkPort } from "../../ports/trace-sink";
import type { WorkspaceLease, WorkspacePort } from "../../ports/workspace";
import { GitWorkspaceAdapter } from "../../adapters/git-workspace";
import { FilesystemArtifactStore } from "../../adapters/filesystem-artifacts";
import { DeterministicTraceSink } from "../../adapters/deterministic-trace";
import { RunLedger } from "../run-ledger";

export interface WorkflowExecutionAdapters {
  readonly ai?: PrimitiveAdapter;
  readonly agentRuntime?: AgentRuntimePort;
  readonly humanGate?: HumanGatePort;
  readonly harness?: PrimitiveAdapter;
  readonly gate?: PrimitiveAdapter;
  readonly workspace?: WorkspacePort;
  readonly commandRunner?: CommandRunnerPort;
  readonly artifactStore?: ArtifactStorePort;
  readonly traceSink?: TraceSinkPort;
  readonly dataRoot?: string;
  readonly now?: () => string;
}

const deterministic: PrimitiveAdapter = ({ input }) => ({ value: input });
const requiredArtifactGate: PrimitiveAdapter = ({ inputArtifact }) => {
  const value = inputArtifact?.value;
  const present =
    value !== undefined &&
    value !== null &&
    (typeof value !== "string" || value.trim().length > 0);
  return { passed: inputArtifact ? present : true, value: inputArtifact?.id };
};
const nowIso = () => new Date().toISOString();

class MissingCommandRunner implements CommandRunnerPort {
  async run(request: CommandRequest): Promise<CommandResult> {
    return {
      command: request.command,
      args: [...(request.args ?? [])],
      exitCode: null,
      stdout: "",
      stderr: "command runner unavailable",
      failure: "spawn",
    };
  }
}

export class WorkflowExecutor {
  private readonly workflows: ReadonlyMap<string, WorkflowDefinition>;
  private readonly ledger: RunLedger;
  private readonly adapters: Required<
    Pick<
      WorkflowExecutionAdapters,
      | "ai"
      | "humanGate"
      | "harness"
      | "gate"
      | "workspace"
      | "commandRunner"
      | "artifactStore"
      | "traceSink"
      | "now"
    >
  >;

  constructor(
    workflows: readonly WorkflowDefinition[],
    adapters: WorkflowExecutionAdapters = {},
  ) {
    this.workflows = new Map(
      workflows.map((workflow) => [workflow.id, workflow]),
    );
    this.adapters = {
      ai:
        adapters.ai ??
        adapters.agentRuntime?.invoke.bind(adapters.agentRuntime) ??
        deterministic,
      humanGate: adapters.humanGate ?? { awaitDecision: async () => undefined },
      harness: adapters.harness ?? deterministic,
      gate: adapters.gate ?? requiredArtifactGate,
      workspace: adapters.workspace ?? new GitWorkspaceAdapter(),
      commandRunner: adapters.commandRunner ?? new MissingCommandRunner(),
      artifactStore:
        adapters.artifactStore ??
        new FilesystemArtifactStore(
          adapters.dataRoot ?? join(tmpdir(), "local-agent-factory", "runs"),
        ),
      traceSink: adapters.traceSink ?? new DeterministicTraceSink(),
      now: adapters.now ?? nowIso,
    };
    this.ledger = new RunLedger(this.adapters.artifactStore, this.adapters.now);
  }

  async execute(
    request: WorkflowExecutionRequest & { readonly workflowId: string },
  ): Promise<WorkflowRun> {
    const workflow = this.workflows.get(request.workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${request.workflowId}`);
    const runIdentifier = request.runIdentifier ?? `local-run-${randomUUID()}`;
    const runContext = { artifacts: new Map<string, Artifact>() };
    const invocations: InvocationResult[] = [];
    const phases: PhaseRecord[] = [];
    const evidence: EvidenceEntry[] = [];
    const budget = request.budget ?? {};
    let lease: WorkspaceLease | undefined;
    let sourceRevision: string | undefined;
    let sourceIntegrity: "Verified" | "Changed" | undefined;
    let failure: WorkflowFailure | string | undefined;
    let integration: IntegrationDecision | undefined = undefined;
    let awaitingReview = false;
    let completedRun: WorkflowRun | undefined;
    const signalController = new AbortController();
    const timeout =
      budget.timeoutMs === undefined
        ? undefined
        : setTimeout(() => signalController.abort(), budget.timeoutMs);
    const trace = (event: Omit<TraceEvent, "runIdentifier">) => {
      void this.adapters.traceSink.record({ ...event, runIdentifier });
    };
    const count = () => {
      if (
        budget.maxInvocations !== undefined &&
        invocations.length >= budget.maxInvocations
      ) {
        throw new BudgetExhaustedError(
          `maximum invocations exceeded: ${budget.maxInvocations}`,
        );
      }
    };

    const base = (): WorkflowRun => ({
      workflowId: workflow.id,
      status: failure
        ? "Failed"
        : awaitingReview
          ? "AwaitingReview"
          : "Succeeded",
      invocations,
      context: runContext,
      phases,
      runIdentifier,
      ...(sourceRevision ? { sourceRevision } : {}),
      ...(lease
        ? { workspacePath: lease.path, workspaceIsolation: lease.isolation }
        : {}),
      ...(sourceIntegrity ? { sourceIntegrity } : {}),
      ...(failure
        ? { failure, workspaceDisposition: "Retained" as const }
        : {}),
      ...(integration ? { integration } : {}),
      evidenceManifest: {
        runIdentifier,
        workflowId: workflow.id,
        status: failure
          ? "Failed"
          : awaitingReview
            ? "AwaitingReview"
            : "Succeeded",
        artifacts: evidence,
        ...(integration ? { integration } : {}),
        ...(sourceRevision && request.sourceRepository
          ? {
              source: {
                repository: request.sourceRepository,
                revision: sourceRevision,
                integrity: sourceIntegrity ?? "Verified",
              },
            }
          : {}),
      },
    });

    try {
      if (workflow.changesSource && !request.sourceRepository) {
        failure = "NonGitSource";
        throw new Error(
          "source-changing workflows require a Git source repository",
        );
      }
      if (request.sourceRepository) {
        let state;
        try {
          state = this.adapters.workspace.inspect(request.sourceRepository);
        } catch (error) {
          failure = "NonGitSource";
          throw error;
        }
        sourceRevision = state.revision;
        sourceIntegrity = "Verified";
        if (state.workingTree !== "Clean") {
          failure = "DirtySource";
          throw new Error("source preflight failed: working tree is dirty");
        }
        if (
          !request.expectedSourceRevision ||
          state.revision !== request.expectedSourceRevision
        ) {
          failure = "UnexpectedSourceRevision";
          throw new Error(
            `source preflight failed: expected ${request.expectedSourceRevision ?? "a revision"}, found ${state.revision}`,
          );
        }
        lease = this.adapters.workspace.create(
          request.sourceRepository,
          join(
            request.workspaceRoot ?? "/tmp/local-agent-factory",
            runIdentifier,
          ),
          request.expectedSourceRevision,
        );
        evidence.push({
          kind: "source",
          reference: request.sourceRepository,
          summary: `revision ${sourceRevision}`,
        });
        evidence.push({
          kind: "workspace",
          reference: lease.path,
          summary: "independent clone",
        });
      }

      const invoke =
        <T extends PrimitiveType>(
          primitiveType: T,
          adapter: PrimitiveAdapter,
        ): PrimitiveFunction<T> =>
        async (
          invocationId,
          name,
          input,
          options: PrimitiveCallOptions = {},
        ) => {
          count();
          if (signalController.signal.aborted)
            throw new Error("workflow canceled");
          const inputArtifact = options.inputArtifact
            ? runContext.artifacts.get(options.inputArtifact)
            : undefined;
          if (options.inputArtifact && !inputArtifact)
            throw new Error(`artifact not found: ${options.inputArtifact}`);
          if (inputArtifact) inputArtifact.consumerInvocationId = invocationId;
          const args = {
            invocationId,
            name,
            input,
            options,
            inputArtifact,
            workspacePath: lease?.path,
            runIdentifier,
            signal: signalController.signal,
          };
          trace({
            type: "invocation_start",
            name,
            payload: { invocationId, primitiveType },
          });
          try {
            const output = await adapter(args);
            const failedOutput = output as
              | { status?: string; passed?: boolean }
              | undefined;
            const status =
              failedOutput?.status === "Failed" ||
              (primitiveType === "Gate" && failedOutput?.passed === false)
                ? "Failed"
                : "Succeeded";
            const invocation: InvocationResult = {
              order: invocations.length + 1,
              invocationId,
              name,
              primitiveType,
              resultType: `${primitiveType}InvocationResult`,
              status,
              input,
              ...(options.inputArtifact
                ? { consumedArtifact: options.inputArtifact }
                : {}),
              ...(options.outputArtifact
                ? { producedArtifact: options.outputArtifact }
                : {}),
              ...(lease ? { workspacePath: lease.path } : {}),
              output,
            };
            invocations.push(invocation);
            if (options.outputArtifact)
              runContext.artifacts.set(options.outputArtifact, {
                id: options.outputArtifact,
                producerInvocationId: invocationId,
                value:
                  (output as { value?: unknown } | undefined)?.value ?? input,
              });
            evidence.push({
              kind: primitiveType.toLowerCase(),
              reference: invocationId,
              summary: status,
            });
            trace({
              type: "invocation_end",
              name,
              payload: { invocationId, primitiveType, status },
            });
            if (status === "Failed")
              failure =
                primitiveType === "Gate" ? "GateRejected" : "CommandFailed";
            return invocation as never;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            invocations.push({
              order: invocations.length + 1,
              invocationId,
              name,
              primitiveType,
              resultType: `${primitiveType}InvocationResult`,
              status: "Failed",
              input,
              ...(lease ? { workspacePath: lease.path } : {}),
              error: message,
            });
            failure = primitiveType === "Gate" ? "GateRejected" : message;
            trace({
              type: "invocation_error",
              name,
              payload: { invocationId, error: message },
            });
            throw error;
          }
        };

      const phase = async (
        definition: PhaseDefinition,
        body: () => Promise<void> | void,
      ) => {
        if (
          !definition.description.trim() ||
          definition.description.trim().replace(/\.$/, "").toLowerCase() ===
            definition.name.replaceAll("_", " ").toLowerCase()
        )
          throw new Error(
            `phase ${definition.name}: description must explain what it does and why`,
          );
        if (budget.maxPhases !== undefined && phases.length >= budget.maxPhases)
          throw new BudgetExhaustedError(
            `maximum phases exceeded: ${budget.maxPhases}`,
          );
        const phaseRecord: PhaseRecord = {
          ...definition,
          sequence: phases.length + 1,
          status: "Running",
          startedAt: this.adapters.now(),
        };
        phases.push(phaseRecord);
        trace({
          type: "phase_start",
          phase: definition.name,
          name: definition.name,
          payload: { description: definition.description },
        });
        try {
          await body();
          const done = {
            ...phaseRecord,
            status: "Succeeded" as const,
            endedAt: this.adapters.now(),
          };
          phases[phases.length - 1] = done;
          trace({
            type: "phase_end",
            phase: definition.name,
            name: definition.name,
            payload: { status: "Succeeded" },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          failure ??= message;
          phases[phases.length - 1] = {
            ...phaseRecord,
            status: "Failed",
            endedAt: this.adapters.now(),
            error: message,
          };
          trace({
            type: "phase_end",
            phase: definition.name,
            name: definition.name,
            payload: { status: "Failed", error: message },
          });
          throw error;
        }
      };

      const context: WorkflowContext = {
        workflowId: workflow.id,
        runIdentifier,
        request: request.request,
        agentOwner: request.agentOwner,
        problemFolder: request.problemFolder,
        workspacePath: lease?.path,
        artifacts: runContext.artifacts,
        context: runContext,
        ai: invoke("AI", this.adapters.ai),
        harness: invoke("Harness", this.adapters.harness),
        gate: invoke("Gate", this.adapters.gate),
        phase,
        review: async () => {
          awaitingReview = true;
          const decision = await this.adapters.humanGate.awaitDecision(base());
          if (decision) {
            integration = decision;
            awaitingReview = decision.outcome !== "Accepted";
            if (decision.outcome === "Rejected")
              failure = "IntegrationRejected";
            evidence.push({
              kind: "review",
              reference: runIdentifier,
              summary: decision.outcome,
            });
          }
          return decision;
        },
        command: async (commandRequest) => {
          if (
            budget.maxCommands !== undefined &&
            evidence.filter((entry) => entry.kind === "command").length >=
              budget.maxCommands
          )
            throw new BudgetExhaustedError(
              `maximum commands exceeded: ${budget.maxCommands}`,
            );
          const result = await this.adapters.commandRunner.run({
            ...commandRequest,
            cwd: commandRequest.cwd ?? lease?.path,
            signal: commandRequest.signal ?? signalController.signal,
          });
          evidence.push({
            kind: "command",
            reference: result.command,
            summary: result.failure ?? `exit ${result.exitCode}`,
          });
          if (result.failure || result.exitCode !== 0)
            failure = "CommandFailed";
          return result;
        },
      };
      await workflow.controller(context);
      if (request.sourceRepository) {
        const after = this.adapters.workspace.inspect(request.sourceRepository);
        if (
          after.workingTree !== "Clean" ||
          after.revision !== sourceRevision
        ) {
          sourceIntegrity = "Changed";
          failure = "SourceChanged";
        }
      }
    } catch (error) {
      if (!failure)
        failure =
          error instanceof BudgetExhaustedError
            ? error.failure
            : error instanceof Error
              ? error.message
              : String(error);
    } finally {
      if (timeout) clearTimeout(timeout);
      const run = base();
      const manifest: EvidenceManifest = {
        ...run.evidenceManifest,
        status: run.status,
        artifacts: evidence,
      };
      completedRun = {
        ...run,
        evidenceManifest: manifest,
        evidenceManifestPath: this.ledger.persist({
          ...run,
          evidenceManifest: manifest,
        }),
      };
    }
    return completedRun!;
  }

  executeWorkflow(
    workflowId: string,
    options: Omit<WorkflowExecutionRequest, "workflowId"> = {},
  ) {
    return this.execute({ ...options, workflowId });
  }

  inspect(runIdentifier: string) {
    return this.ledger.inspect(runIdentifier);
  }

  decide(
    runIdentifier: string,
    decision: Omit<IntegrationDecision, "decidedAt">,
  ) {
    return this.ledger.decide(runIdentifier, decision);
  }
}
