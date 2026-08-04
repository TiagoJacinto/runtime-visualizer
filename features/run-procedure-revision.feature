# Source: [Live Procedure Workspace PRD](../2026-07-30-live-procedure-workspace-design.md)
Feature: Run a Procedure revision
  As an Operator,
  I want to run a displayed Procedure revision,
  So that each Execution uses the same graph revision while updates are queued
  Domain definitions: [Operator](../ROLES.md#operator), [Procedure](../CONTEXT.md#procedure), [Source revision](../CONTEXT.md#source-revision), [Execution](../CONTEXT.md#execution), [Execution event](../CONTEXT.md#execution-event), [Terminal Result](../CONTEXT.md#terminal-result), [Control-flow graph](../CONTEXT.md#control-flow-graph)
  Actor: [Operator](../ROLES.md#operator)
  Platform: [Runtime Visualizer workspace](../PLATFORMS.md#runtime-visualizer-workspace)

  Rule: Each Run is independent

    Scenario: Start concurrent Executions from one displayed revision
      Given Procedure revision{file: "main.ts", name: "prepare", revision: "R1", graphNodes: [Entry, prepare(), Exit]}
      When I startRuns(procedure: "prepare", revision: "R1", count: 2)
      Then I view Execution{} in Execution registry: Each requested Run has its own identity and revision
        | client id | status  | revision |
        | run-1     | running | R1       |
        | run-2     | running | R1       |
      And I view Execution event{} in Execution streams: Each Run has an independent event stream
        | client id | event          |
        | run-1     | node: prepare() |
        | run-2     | node: prepare() |

  Rule: Runs use the displayed immutable revision

    Scenario: Run during a queued update uses the displayed revision
      Given Procedure revision{file: "main.ts", name: "prepare", revision: "R1", graphNodes: [Entry, prepare(), Exit]}
      And Source revision{file: "main.ts", revision: "R2"}
      When I run(procedure: "prepare", revision: "R1")
      Then I view Execution{revision: "R1"} in Execution registry: The Run uses the displayed revision
      And I view Execution event{node: "prepare()"} in Execution streams: Node events remain valid for the displayed graph

    Scenario: Reject an unavailable execution revision
      Given Procedure revision{file: "main.ts", name: "prepare", revision: "R1", status: Unavailable}
      When I run(procedure: "prepare", revision: "R1")
      Then I view Terminal Result{status: Failed, error: "Revision unavailable"} in Execution streams: The Run failure is explicit
