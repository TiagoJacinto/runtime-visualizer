Feature: Compose a multi-file TypeScript program
  As an Operator
  I want to edit multiple named TypeScript files
  So that imports can resolve across the complete program
  Domain definitions: [Operator](../CONTEXT.md#operator), [Procedure](../CONTEXT.md#procedure), [Execution](../CONTEXT.md#execution), [Control-flow graph](../CONTEXT.md#control-flow-graph)

  Scenario: Submit two named files together
    Given two TypeScript file editors
    When I name the files "main.ts" and "helper.ts"
    And I enter source that imports helper from the second file
    And I visualize control flow
    Then the request contains both named files
