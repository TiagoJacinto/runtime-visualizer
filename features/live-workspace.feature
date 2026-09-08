Feature: Operate the live backend workspace
  As an Operator,
  I want to inspect and run saved Procedures,
  So that the workspace shows current backend-owned data

  Scenario: Inspect and run a saved Procedure
    Given the live workspace is loaded
    When I select saved file "fixtures/file1.ts"
    Then the source panel contains "FizzBuzz"
    And the live Control-flow graph is visible
    When I run the displayed Procedure
    Then the Run inspector shows a "Succeeded" outcome

  Scenario: Keep source visible when analysis has diagnostics
    Given the live workspace is loaded
    When I select saved file "fixtures/entry.ts"
    Then the source panel contains "export function run"
    And analysis diagnostics are visible
    And the Run Procedure action is disabled

  Scenario: Queue a selected-file update during an Execution
    Given the live workspace is loaded
    And a slow saved Procedure is available
    When I select saved file "hve2e-queue.ts"
    And I run the displayed Procedure
    And the selected file changes during the Execution
    Then the workspace shows "Update queued"
    And the source stays pinned during the Execution
    When the Execution reaches a terminal outcome
    Then the workspace refreshes to the newest source

  Scenario: Keep the graph workspace visible while switching context tabs
    Given the live workspace is loaded
    Then the Scope and Runs context tabs are visible
    When I select saved file "fixtures/file1.ts"
    And I select the Runs context
    Then the live Control-flow graph is visible
    When I select the Scope context
    Then the Scope and Runs context tabs are visible

  Scenario: View and cancel a server-owned run from the Runs context
    Given the live workspace is loaded
    And a cancellable saved Procedure is available
    When I select saved file "hve2e-cancel.ts"
    And I run the displayed Procedure
    And I select the Runs context
    Then the Run inspector exposes View and Cancel actions
    When I cancel the displayed run
    Then the Run inspector shows a "Cancelled" outcome
