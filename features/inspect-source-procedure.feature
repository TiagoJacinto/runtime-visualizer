# Source: [Live Procedure Workspace PRD](../2026-07-30-live-procedure-workspace-design.md)
Feature: Inspect a source Procedure
  As an Operator,
  I want to inspect a source Procedure,
  So that I can understand its source and control flow through the workspace
  Domain definitions: [Operator](../ROLES.md#operator), [Source file](../CONTEXT.md#source-file), [Source revision](../CONTEXT.md#source-revision), [Procedure](../CONTEXT.md#procedure), [Procedure catalog](../CONTEXT.md#procedure-catalog), [Control-flow graph](../CONTEXT.md#control-flow-graph), [Graph diagnostic](../CONTEXT.md#graph-diagnostic)
  Actor: [Operator](../ROLES.md#operator)
  Platform: [Runtime Visualizer workspace](../PLATFORMS.md#runtime-visualizer-workspace)

  Rule: Source files are listed from the configured source repository

    Scenario: List regular source files in deterministic order
      Given Source folder{entries: ["main.ts", "nested/helper.ts", ".private.ts", "linked.ts"], hiddenDirectories: [".cache"], symbolicLinks: ["linked.ts"]}
      When I listSourceFiles()
      Then I view Source file{} in File catalog: Regular files are listed as relative paths
        | path             |
        | main.ts          |
        | nested/helper.ts |
      And I view Source file{path: ".private.ts"} not in File catalog: Hidden files are excluded
      And I view Source file{path: "linked.ts"} not in File catalog: Symbolic links are excluded

    Scenario: Return an empty catalog when the configured folder is missing
      Given Source folder{status: Missing}
      When I listSourceFiles()
      Then I view Source file{} not in File catalog: No files are available

  Rule: A source file exposes its Procedures and revision

    Scenario: Discover the top level and functions in source order
      Given Source file{path: "main.ts", source: "const value = 1; function prepare() {} function run() {}"}
      When I discoverProcedures(file: "main.ts")
      Then I view Procedure{} in Procedure catalog: The file and supported functions are available
        | id                 | kind      | name    | order |
        | top-level          | Top level |         | 1     |
        | function:prepare   | Function  | prepare | 2     |
        | function:run       | Function  | run     | 3     |

    Scenario: Read source with the revision used for analysis
      Given Source file{path: "main.ts", source: "function prepare() { return 1 }"}
      When I readSource(file: "main.ts")
      Then I view Source revision{file: "main.ts", source: "function prepare() { return 1 }"} in Procedure workspace: The source revision is available

  Rule: A selected source Procedure remains addressable

    Scenario: Reject a path outside the configured source repository
      Given Source folder{entries: ["main.ts"]}
      When I inspectProcedure(file: "../secret.ts", name: "", showImports: false)
      Then I view Graph diagnostic{reason: "Path is outside the configured source repository"} in Procedure workspace: The source path is rejected
      And I view Control-flow graph{} not in Procedure workspace: No graph is created for the rejected path

    Scenario: Preserve a missing function as an explicit selection error
      Given Source file{path: "main.ts", source: "function prepare() {}"}
      When I inspectProcedure(file: "main.ts", name: "missing", showImports: false)
      Then I view Graph diagnostic{procedure: "missing", reason: "Procedure was not found"} in Procedure workspace: The requested Procedure remains invalid
      And I view Procedure{} in Procedure catalog: The available Procedures remain visible
        | name    |
        |         |
        | prepare |
