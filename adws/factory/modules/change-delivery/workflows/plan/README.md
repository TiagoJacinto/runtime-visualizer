# Plan

Turns the request into an implementable change plan.

## Interface

The module exports `planWorkflow`, a typed `WorkflowDefinition` consumed by the change-delivery registry. The request is supplied through the Factory workflow execution request.

## Invariant

The workflow runs its request phase before its local phase graph and records each agent result as evidence. Source-changing workflows require a verified Git source repository.

## Verification

Run `bun run test -- src/modules/workflow-execution/workflow-execution.test.ts`.
