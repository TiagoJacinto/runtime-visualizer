@legacy-ui
Feature: Analyze a complete TypeScript program
  As an Operator,
  I want to analyze a Procedure together with its imported Procedures,
  So that imports resolve across the complete program
  Domain definitions: [Operator](../CONTEXT.md#operator), [Procedure](../CONTEXT.md#procedure), [Import](../CONTEXT.md#import), [Control-flow graph](../CONTEXT.md#control-flow-graph), [Graph node](../CONTEXT.md#graph-node), [Graph diagnostic](../CONTEXT.md#graph-diagnostic)

  Scenario: Resolve an import from another file Procedure
    Given selected:Procedure{name: "main.ts", kind: File, status: Ready, source: "import { helper } from './helper'; helper()"}
    And dependency:Procedure{name: "helper.ts", kind: File, status: Ready, source: "export function helper() {}"}
    When I visualizeControlFlow(procedure: "main.ts")
    Then I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: The selected Procedure retains its executable call
    And I view GraphDiagnostic{reason: "Required dependency could not be resolved", dependency: "helper.ts"} not in ControlFlowGraph: The imported Procedure resolves successfully
