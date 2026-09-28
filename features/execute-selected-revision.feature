Feature: Execute selected browser project revisions
  The workspace runs the exact immutable Analysis revision selected by the Operator.
  It shows execution progress and keeps the outcome available when the Operator cancels a run.

  Scenario: Run the selected revision while a newer revision exists
    Given "src/main.ts" has Analysis revisions "revision-1" and "revision-2"
    And Analysis revision "revision-1" is selected while "revision-2" is current
    When I run the selected Procedure
    Then the active Execution uses Analysis revision "revision-1"
    And its progress is shown on the selected Control-flow graph

  Scenario: Cancel a running Execution
    Given an active Execution is running Analysis revision "revision-1"
    When I confirm cancellation of that Execution
    Then the Execution is shown as cancelled in execution history
    And the Execution is no longer active
