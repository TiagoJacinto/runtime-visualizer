@test-only
Feature: Keep live workspace resources synchronized
  The workspace preserves the selected Procedure while it is running and refreshes after the Execution finishes.

  Scenario: Queue a newer revision during an active Execution
    Given the selected Procedure is displayed at revision "revision-1"
    And an Execution is active for revision "revision-1"
    When the server announces revision "revision-2" for the selected file
    Then the displayed Procedure remains at revision "revision-1"
    And the workspace reports that an update is queued
    When the Execution finishes
    Then revision "revision-2" is available for the selected Procedure
