Feature: Analyze browser-managed project files
  Operators can inspect a selected TypeScript file and its control-flow graph in the browser.

  Scenario: Show a graph for a valid selected file
    Given I have opened a project containing a valid "main.ts" file
    When I select "main.ts"
    Then its control-flow graph is displayed
    And no analysis error is shown
