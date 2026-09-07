import { buildReviewWorkflow } from "./workflows/build-review";
import { buildWorkflow } from "./workflows/build";
import { documentWorkflow } from "./workflows/document";
import { doubleTddWorkflow } from "./workflows/double-tdd";
import { planWorkflow } from "./workflows/plan";
import { prdOrientedDesignWorkflow } from "./workflows/prd-oriented-design";
import { prdOrientedDiscoveryWorkflow } from "./workflows/prd-oriented-discovery";
import { prewalkWorkflow } from "./workflows/prewalk";
import { promptWorkflow } from "./workflows/prompt";
import { qualityWorkflow } from "./workflows/quality";
import { researchWorkflow } from "./workflows/research";
import { scoutWorkflow } from "./workflows/scout";
import type { WorkflowDefinition } from "../workflow-execution";

/** The single registration point for change-delivery workflow capabilities. */
export const changeDeliveryWorkflows: readonly WorkflowDefinition[] = [
  promptWorkflow,
  scoutWorkflow,
  planWorkflow,
  prewalkWorkflow,
  buildWorkflow,
  qualityWorkflow,
  buildReviewWorkflow,
  doubleTddWorkflow,
  documentWorkflow,
  researchWorkflow,
  prdOrientedDesignWorkflow,
  prdOrientedDiscoveryWorkflow,
];

export function getChangeDeliveryWorkflow(id: string): WorkflowDefinition {
  const workflow = changeDeliveryWorkflows.find(
    (candidate) => candidate.id === id,
  );
  if (!workflow) throw new Error(`Workflow not found: ${id}`);
  return workflow;
}
