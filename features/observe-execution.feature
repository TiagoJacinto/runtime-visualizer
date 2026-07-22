Feature: Highlight procedure execution in a control-flow graph
  As an Operator,
  I want to see a Procedure Execution in its Control-flow graph,
  So that I can see which node is currently running
  Domain definitions: [Operator](../CONTEXT.md#operator), [Procedure](../CONTEXT.md#procedure), [Execution](../CONTEXT.md#execution), [Execution highlighting](../CONTEXT.md#execution-highlighting), [Control-flow graph](../CONTEXT.md#control-flow-graph), [Graph node](../CONTEXT.md#graph-node)

  Scenario: Highlight the active node while execution follows one branch
    Given Procedure{name: "classify.ts", kind: File, status: Ready, source: "prepare(); if (ready) { work() } else { wait() }"}
    When I run(procedure: "classify.ts")
    Then I view GraphNode{} in ControlFlowGraph: The complete possible flow is visible
      | label   | kind       |
      | Entry   | Entry      |
      | prepare() | Executable |
      | ready   | Decision   |
      | work()  | Executable |
      | wait()  | Executable |
      | Exit    | Exit       |
    And I await view ExecutionHighlighting{node: "prepare()"} in ControlFlowGraph: The preparation node is highlighted
    And I await view ExecutionHighlighting{node: "ready"} in ControlFlowGraph: The decision node is highlighted
    And I await view ExecutionHighlighting{node: "work()"} in ControlFlowGraph: The selected work node is highlighted
    And I view GraphNode{label: "wait()"} in ControlFlowGraph: The unselected possible path remains visible
    And I view ExecutionHighlighting{node: "wait()"} not in ControlFlowGraph: The unselected path is not highlighted
    And I view ExecutionHighlighting{} not in ControlFlowGraph: No node remains highlighted after completion
