Feature: Diagnose control-flow graph generation
  As an Operator,
  I want graph generation failures explained,
  So that I never mistake a partial graph for a complete Control-flow graph
  Domain definitions: [Operator](../CONTEXT.md#operator), [Procedure](../CONTEXT.md#procedure), [Control-flow graph](../CONTEXT.md#control-flow-graph), [With statement](../CONTEXT.md#with-statement), [Graph diagnostic](../CONTEXT.md#graph-diagnostic)
  Actor: [Operator](../ROLES.md#operator)
  Platform: [Runtime Visualizer workspace](../PLATFORMS.md#runtime-visualizer-workspace)

  Scenario: Reject a selected Procedure that fails type-checking
    Given Procedure{name: "broken.ts", kind: File, status: TypeError, source: "const count: number = 'many'; work()"}
    When I inspectProcedure(procedure: "broken.ts")
    Then I view GraphDiagnostic{procedure: "broken.ts", reason: "Type checking failed"} in Procedure: The failure is explained
    And I view ControlFlowGraph{procedure: "broken.ts"} not in Procedure: No partial graph is presented

  Scenario: Reject a required dependency that fails type-checking
    Given selected:Procedure{name: "main.ts", kind: File, status: Ready, source: "import { count } from './count'; work(count)"}
    And required:Procedure{name: "count.ts", kind: File, status: TypeError, source: "export const count: number = 'many'"}
    When I inspectProcedure(procedure: "main.ts")
    Then I view GraphDiagnostic{procedure: "main.ts", dependency: "count.ts", reason: "Type checking failed"} in Procedure: The dependency failure is explained
    And I view ControlFlowGraph{procedure: "main.ts"} not in Procedure: No partial graph is presented

  Scenario: Ignore a type error in an unrelated Procedure
    Given selected:Procedure{name: "main.ts", kind: File, status: Ready, source: "work()"}
    And unrelated:Procedure{name: "broken.ts", kind: File, status: TypeError, source: "const count: number = 'many'"}
    When I inspectProcedure(procedure: "main.ts")
    Then I view ControlFlowGraph{procedure: "main.ts"} in Procedure: Unrelated diagnostics do not block the selected Procedure
    And I view GraphDiagnostic{procedure: "main.ts"} not in Procedure: Successful generation has no failure diagnostic

  Scenario: Reject syntactically invalid source
    Given Procedure{name: "invalid.ts", kind: File, status: SyntaxError, source: "if (ready { work() }"}
    When I inspectProcedure(procedure: "invalid.ts")
    Then I view GraphDiagnostic{procedure: "invalid.ts", reason: "Syntax is invalid"} in Procedure: The syntax failure is explained
    And I view ControlFlowGraph{procedure: "invalid.ts"} not in Procedure: No partial graph is presented

  Scenario: Reject a With statement
    Given Procedure{name: "legacy.ts", kind: File, status: Unsupported, source: "with (settings) { work() }"}
    When I inspectProcedure(procedure: "legacy.ts")
    Then I view GraphDiagnostic{procedure: "legacy.ts", reason: "With statement is unsupported"} in Procedure: Unsupported syntax is explained
    And I view ControlFlowGraph{procedure: "legacy.ts"} not in Procedure: No partial graph is presented
