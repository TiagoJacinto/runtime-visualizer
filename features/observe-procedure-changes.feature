# Source: [Live Procedure Workspace PRD](../2026-07-30-live-procedure-workspace-design.md)
Feature: Observe backend source changes
  As an Operator,
  I want to observe backend source changes,
  So that I know when a selected Procedure has a newer revision
  Domain definitions: [Operator](../ROLES.md#operator), [Source file](../CONTEXT.md#source-file), [Source revision](../CONTEXT.md#source-revision), [File change](../CONTEXT.md#file-change)
  Actor: [Operator](../ROLES.md#operator)
  Platform: [Runtime Visualizer workspace](../PLATFORMS.md#runtime-visualizer-workspace)

  Rule: Source changes are observable as additions, modifications, and deletions

    Scenario Outline: Observe a source file change
      Given Source folder{files: ["main.ts"], revision: "R1"}
      When I observeSourceChanges()
      Then I view File change{file: <file>, change: <change>, revision: <revision>} in Source change stream: The source change is published

      Examples:
        | file         | change   | revision |
        | "new.ts"     | Added    | "R2"     |
        | "main.ts"    | Modified | "R3"     |
        | "main.ts"    | Deleted  |          |

    Scenario: Publish the latest revision with a modification
      Given Source file{path: "main.ts", revision: "R1", source: "function prepare() {}"}
      When I observeSourceChanges()
      Then I view File change{file: "main.ts", change: Modified, revision: "R2"} in Source change stream: The changed file has a new revision
