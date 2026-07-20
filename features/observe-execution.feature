Feature: Observe procedure execution
  As an operator,
  I want to observe a procedure execution,
  So that I can understand the path it takes
  Domain definitions: [Procedure](../CONTEXT.md#procedure), [ExecutionEvent](../CONTEXT.md#execution-event), [Trace](../CONTEXT.md#trace)

  Scenario: Follow the FizzBuzz execution through a branch
    Given Procedure{name: "file1.ts", status: Ready}
    When I run(procedure: "file1.ts")
    Then I await view ExecutionEvent{kind: Statement, label: "const upper = 15"} in Trace: Initialization is observed
    And I await view ExecutionEvent{kind: Branch, condition: "i % 15 === 0", outcome: True} in Trace: FizzBuzz branch is observed
    And I await view Result{status: Succeeded} in Execution: Procedure completion is observed
    And I view ExecutionEvent{state: Active} not in Trace: No event remains active after completion
