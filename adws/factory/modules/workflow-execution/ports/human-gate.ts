import type { IntegrationDecision, WorkflowRun } from "../domain/workflow";

export interface HumanGatePort {
  awaitDecision(run: WorkflowRun): Promise<IntegrationDecision | undefined>;
}
