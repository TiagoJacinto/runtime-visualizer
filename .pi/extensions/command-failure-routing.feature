Feature: Route configured command failures to Jev
  A configured Pi coding agent extension classifies relevant command failures using Jev.
  It uses repository routing configuration and leaves test files unchanged.

  Scenario: Recommend creation when no test covers the endpoint
    Given the repository configures "backend:test:integration:incoming" for Jev routing
    And no repository test references endpoint "POST /api/procedures"
    When the command failure reports that endpoint returned 404 because it is unreachable
    Then the request sent to Jev includes the endpoint and an empty matching-test list
    And Jev recommends the configured route "create-incoming-test"
    And the extension displays the recommended route
    And no test files are created, changed, or deleted

  Scenario: Recommend deletion when a test already covers the unreachable endpoint
    Given the repository contains a test that references endpoint "POST /api/procedures"
    And the command failure reports that endpoint returned 404 because it is unreachable
    When the configured command fails
    Then the request sent to Jev includes the endpoint and matching test path
    And Jev recommends the configured route "delete-behavior-test"
    And no test files are created, changed, or deleted

  Scenario: Log the request and response for a routed command failure
    Given command-failure routing is configured
    When a configured command fails and the extension sends a request to Jev
    Then the extension appends one JSONL record with the bounded redacted request and Jev response
    And the record contains no API credentials
