Feature: Keep project analysis current as source files change
  As an Operator,
  I want changes to my open project to appear in the workspace,
  So that I can inspect its current source and analysis.

  Scenario: Include a newly added source file
    Given I have opened a project containing "src/main.ts"
    When "src/helper.ts" is added to the project
    Then "src/helper.ts" appears in the project file tree
    And its source is available for analysis

  Scenario: Refresh the selected analysis when its source changes
    Given I have opened a project with "src/main.ts" selected at Analysis revision "revision-1"
    When the source of "src/main.ts" changes
    Then the workspace displays the updated source
    And a new Analysis revision is selected
    And Analysis revision "revision-1" remains available

  Scenario: Reanalyze a Procedure when its dependency changes
    Given I have opened a project where "src/main.ts" imports "src/helper.ts"
    And "src/main.ts" has an Analysis revision based on the current helper source
    When the source of "src/helper.ts" changes
    Then a new Analysis revision is available for "src/main.ts"
    And the new Analysis revision uses the changed helper source

  Scenario: Keep the workspace selection valid when a selected file is deleted
    Given I have opened a project containing "src/main.ts" and "src/helper.ts"
    And "src/main.ts" is selected
    When "src/main.ts" is deleted from the project
    Then "src/main.ts" is absent from the project file tree
    And "src/helper.ts" is selected
    And the Analysis revision history for "src/main.ts" remains available

  Scenario: Show an empty state when the last source file is deleted
    Given I have opened a project containing only "src/main.ts"
    And "src/main.ts" is selected
    When "src/main.ts" is deleted from the project
    Then the project file tree contains no source files
    And the workspace indicates that no TypeScript or TSX source files are available
    And no source file is selected
