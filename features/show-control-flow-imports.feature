@legacy-ui
Feature: Show imports with a control-flow graph
  As an Operator,
  I want to choose whether a file Procedure's imports accompany its graph,
  So that I can add dependency context without expanding local control flow
  Domain definitions: [Operator](../CONTEXT.md#operator), [Procedure](../CONTEXT.md#procedure), [Control-flow graph](../CONTEXT.md#control-flow-graph), [Graph node](../CONTEXT.md#graph-node), [Control-flow transition](../CONTEXT.md#control-flow-transition), [Executable statement](../CONTEXT.md#executable-statement), [Import](../CONTEXT.md#import)

  Scenario: Hide imports by default
    Given Procedure{name: "main.ts", kind: File, status: Ready, source: "import { helper } from './helper'; helper()"}
    When I visualizeControlFlow(procedure: "main.ts")
    Then I view Import{source: "import { helper } from './helper'"} not in ControlFlowGraph: Imports do not appear by default
    And I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: Local flow remains visible

  Scenario: Show current-file imports as context
    Given current:Procedure{name: "main.ts", kind: File, status: Ready, source: "import { helper } from './helper'; helper()"}
    And imported:Procedure{name: "helper.ts", kind: File, status: Ready, source: "export function helper() { work() }"}
    And Import{visibility: Visible}
    When I visualizeControlFlow(procedure: "main.ts")
    Then I view Import{source: "import { helper } from './helper'"} in ControlFlowGraph: The current file's dependency context is visible
    And I view ControlFlowTransition{from: "import { helper } from './helper'", to: "helper()"} not in ControlFlowGraph: Contextual imports do not become local execution flow
    And I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: The local call remains one node
    And I view GraphNode{label: "work()"} not in ControlFlowGraph: The imported Procedure is not expanded
