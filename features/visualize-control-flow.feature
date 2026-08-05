Feature: Visualize a control-flow graph
  As an Operator,
  I want to visualize a Procedure's possible control flow,
  So that I can understand every path without running it
  Domain definitions: [Operator](../CONTEXT.md#operator), [Procedure](../CONTEXT.md#procedure), [Control-flow graph](../CONTEXT.md#control-flow-graph), [Graph node](../CONTEXT.md#graph-node), [Control-flow transition](../CONTEXT.md#control-flow-transition), [Entry](../CONTEXT.md#entry), [Exit](../CONTEXT.md#exit), [Executable statement](../CONTEXT.md#executable-statement), [Decision node](../CONTEXT.md#decision-node), [Expression decision](../CONTEXT.md#expression-decision), [Loop](../CONTEXT.md#loop), [Abrupt statement](../CONTEXT.md#abrupt-statement), [Finally block](../CONTEXT.md#finally-block), [Label](../CONTEXT.md#label), [Node label](../CONTEXT.md#node-label)

  Scenario: Connect an empty Procedure directly from Entry to Exit
    Given Procedure{name: "empty.ts", kind: File, status: Ready, source: ""}
    When I visualizeControlFlow(procedure: "empty.ts")
    Then I view GraphNode{label: Entry, kind: Entry} in ControlFlowGraph: The start boundary is visible
    And I view GraphNode{label: Exit, kind: Exit} in ControlFlowGraph: The end boundary is visible
    And I view ControlFlowTransition{from: Entry, outcome: "", to: Exit} in ControlFlowGraph: The empty flow is complete

  Scenario Outline: Visualize supported TypeScript file Procedures
    Given Procedure{name: <name>, kind: File, status: Ready, source: <source>}
    When I visualizeControlFlow(procedure: <name>)
    Then I view GraphNode{label: <node>, kind: Executable} in ControlFlowGraph: Supported TypeScript source is represented

    Examples:
      | name       | source                   | node                     |
      | "work.ts"  | "work()"                 | "work()"                 |
      | "view.tsx" | "const view = <Panel />" | "const view = <Panel />" |

  Scenario: Visualize both paths through a branch
    Given Procedure{name: "classify.ts", kind: File, status: Ready, source: "if (ready) { work() } else { wait() }"}
    When I visualizeControlFlow(procedure: "classify.ts")
    Then I view GraphNode{} in ControlFlowGraph: Every branch node is visible
      | label   | kind       |
      | Entry   | Entry      |
      | ready   | Decision   |
      | work()  | Executable |
      | wait()  | Executable |
      | Exit    | Exit       |
    And I view ControlFlowTransition{} in ControlFlowGraph: Both branch outcomes are visible
      | from   | outcome | to     |
      | Entry  |         | ready  |
      | ready  | true    | work() |
      | ready  | false   | wait() |
      | work() |         | Exit   |
      | wait() |         | Exit   |

  Scenario: Identify sequential statements and their source locations
    Given Procedure{name: "calculate", kind: Function, status: Ready, source: "function calculate() {\n  const value = read()\n  return value\n}"}
    When I visualizeControlFlow(procedure: "calculate")
    Then I view GraphNode{} in ControlFlowGraph: Source text and line ranges identify every node
      | label                | line range |
      | Entry                | Boundary   |
      | const value = read() | 2-2        |
      | return value         | 3-3        |
      | Exit                 | Boundary   |
    And I view ControlFlowTransition{from: "return value", outcome: "", to: Exit} in ControlFlowGraph: Return reaches the Procedure boundary

  Scenario: Terminate a Procedure with an uncaught throw
    Given Procedure{name: "fail", kind: Function, status: Ready, source: "function fail(error: Error) { throw error }"}
    When I visualizeControlFlow(procedure: "fail")
    Then I view GraphNode{label: "throw error", kind: Executable} in ControlFlowGraph: The abrupt statement is visible
    And I view ControlFlowTransition{from: "throw error", outcome: "", to: Exit} in ControlFlowGraph: The uncaught throw reaches Exit

  Scenario: Preserve switch alternatives fall-through and break
    Given Procedure{name: "route.ts", kind: File, status: Ready, source: "switch (kind) { case 'a': first(); case 'b': second(); break; default: other() } done()"}
    When I visualizeControlFlow(procedure: "route.ts")
    Then I view ControlFlowTransition{} in ControlFlowGraph: Cases branch fall through and converge correctly
      | from     | outcome  | to       |
      | kind     | case 'a' | first()  |
      | kind     | case 'b' | second() |
      | kind     | default  | other()  |
      | first()  |          | second() |
      | second() |          | break    |
      | break    |          | done()   |
      | other()  |          | done()   |

  Scenario: Represent a while loop as a cycle
    Given Procedure{name: "wait.ts", kind: File, status: Ready, source: "while (ready) { work() } after()"}
    When I visualizeControlFlow(procedure: "wait.ts")
    Then I view ControlFlowTransition{} in ControlFlowGraph: The loop can repeat or exit
      | from   | outcome | to      |
      | ready  | true    | work()  |
      | work() |         | ready   |
      | ready  | false   | after() |

  Scenario: Preserve an infinite loop with an empty body as a cycle
    Given Procedure{name: "spin.ts", kind: File, status: Ready, source: "for (;;);"}
    When I visualizeControlFlow(procedure: "spin.ts")
    Then I view GraphNode{label: ";"} not in ControlFlowGraph: The empty body is omitted
    And I view ControlFlowTransition{from: "for (;;)", outcome: repeat, to: "for (;;)"} in ControlFlowGraph: The non-terminating cycle remains visible
    And I view ControlFlowTransition{from: "for (;;)", to: Exit} not in ControlFlowGraph: An impossible exit is not invented

  Scenario: Execute a do-while body before its decision
    Given Procedure{name: "retry.ts", kind: File, status: Ready, source: "do { attempt() } while (retry); finish()"}
    When I visualizeControlFlow(procedure: "retry.ts")
    Then I view ControlFlowTransition{} in ControlFlowGraph: The body precedes the loop decision
      | from      | outcome | to        |
      | Entry     |         | attempt() |
      | attempt() |         | retry     |
      | retry     | true    | attempt() |
      | retry     | false   | finish()  |

  Scenario: Continue a for loop through its update
    Given Procedure{name: "count.ts", kind: File, status: Ready, source: "for (let i = 0; i < 3; i++) { continue } after()"}
    When I visualizeControlFlow(procedure: "count.ts")
    Then I view ControlFlowTransition{} in ControlFlowGraph: For-loop phases retain their control-flow order
      | from      | outcome | to       |
      | let i = 0 |         | i < 3    |
      | i < 3     | true    | continue |
      | continue  |         | i++      |
      | i++       |         | i < 3    |
      | i < 3     | false   | after()  |

  Scenario Outline: Iterate over collection keys and values
    Given Procedure{name: "iterate.ts", kind: File, status: Ready, source: <source>}
    When I visualizeControlFlow(procedure: "iterate.ts")
    Then I view ControlFlowTransition{from: <decision>, outcome: "next item", to: "work(item)"} in ControlFlowGraph: The body can receive an item
    And I view ControlFlowTransition{from: "work(item)", outcome: "", to: <decision>} in ControlFlowGraph: Iteration returns for the next item
    And I view ControlFlowTransition{from: <decision>, outcome: "iteration end", to: "after()"} in ControlFlowGraph: Iteration can finish without entering the body

    Examples:
      | source                                          | decision      |
      | "for (const item in values) { work(item) } after()" | "values keys"  |
      | "for (const item of values) { work(item) } after()" | "values items" |

  Scenario Outline: Continue through a condition-controlled loop
    Given Procedure{name: "continue.ts", kind: File, status: Ready, source: <source>}
    When I visualizeControlFlow(procedure: "continue.ts")
    Then I view ControlFlowTransition{from: continue, outcome: "", to: ready} in ControlFlowGraph: Continue returns to the loop condition

    Examples:
      | source                                |
      | "while (ready) { continue } after()" |
      | "do { continue } while (ready)"      |

  Scenario: Resolve a labeled break without showing a label node
    Given Procedure{name: "labeled.ts", kind: File, status: Ready, source: "outer: while (ready) { break outer } done()"}
    When I visualizeControlFlow(procedure: "labeled.ts")
    Then I view GraphNode{label: outer} not in ControlFlowGraph: The Label remains jump metadata
    And I view ControlFlowTransition{from: "break outer", outcome: "", to: "done()"} in ControlFlowGraph: The labeled jump reaches its destination

  Scenario: Route normal and exceptional paths through finally
    Given Procedure{name: "recover", kind: Function, status: Ready, source: "function recover(failed: boolean, error: Error) { try { if (failed) throw error; work() } catch { recoverWork() } finally { cleanup() } }"}
    When I visualizeControlFlow(procedure: "recover")
    Then I view ControlFlowTransition{} in ControlFlowGraph: Explicit exception and normal paths traverse finally
      | from          | outcome | to            |
      | failed        | true    | throw error   |
      | throw error   |         | recoverWork() |
      | failed        | false   | work()        |
      | recoverWork() |         | cleanup()     |
      | work()        |         | cleanup()     |
      | cleanup()     |         | Exit          |

  Scenario Outline: Traverse finally before an abrupt destination
    Given Procedure{name: <name>, kind: <kind>, status: Ready, source: <source>}
    When I visualizeControlFlow(procedure: <name>)
    Then I view ControlFlowTransition{from: <abrupt>, outcome: "", to: "cleanup()"} in ControlFlowGraph: Finally intercepts the abrupt path
    And I view ControlFlowTransition{from: "cleanup()", outcome: "", to: <destination>} in ControlFlowGraph: The abrupt path resumes after finally

    Examples:
      | name        | kind     | source                                                                       | abrupt          | destination |
      | "finish"    | Function | "function finish(result: number) { try { return result } finally { cleanup() } }" | "return result" | Exit        |
      | "break.ts"  | File     | "while (ready) { try { break } finally { cleanup() } } after()"             | break           | "after()"   |
      | "update.ts" | File     | "for (let i = 0; i < 3; i++) { try { continue } finally { cleanup() } }"     | continue        | "i++"       |
      | "fail"      | Function | "function fail(error: Error) { try { throw error } finally { cleanup() } }"   | "throw error"   | Exit        |

  Scenario: Omit an empty statement while retaining runtime-visible statements
    Given Procedure{name: "flow", kind: Function, status: Ready, source: "function* flow(first: unknown, rest: Iterable<unknown>) { ; debugger; yield first; yield* rest }"}
    When I visualizeControlFlow(procedure: "flow")
    Then I view GraphNode{label: ";"} not in ControlFlowGraph: The empty statement is omitted
    And I view GraphNode{} in ControlFlowGraph: Runtime-visible statements remain visible
      | label       |
      | debugger    |
      | yield first |
      | yield* rest |

  Scenario: Show an await suspension point
    Given Procedure{name: "load", kind: Function, status: Ready, source: "async function load(task: Promise<void>) { await task; finish() }"}
    When I visualizeControlFlow(procedure: "load")
    Then I view GraphNode{label: "await task", kind: Executable} in ControlFlowGraph: The suspension point is visible
    And I view ControlFlowTransition{from: "await task", outcome: "", to: "finish()"} in ControlFlowGraph: The possible flow continues sequentially

  Scenario Outline: Expose control flow inside expressions
    Given Procedure{name: "expression.ts", kind: File, status: Ready, source: <source>}
    When I visualizeControlFlow(procedure: "expression.ts")
    Then I view GraphNode{label: <decision>, kind: Decision} in ControlFlowGraph: The expression decision is visible
    And I view ControlFlowTransition{from: <decision>, outcome: <first outcome>, to: <first destination>} in ControlFlowGraph: The conditional evaluation path is visible
    And I view ControlFlowTransition{from: <decision>, outcome: <second outcome>, to: <second destination>} in ControlFlowGraph: The alternate evaluation path is visible

    Examples:
      | source                         | decision  | first outcome | first destination | second outcome | second destination |
      | "ready && work()"             | "ready"   | truthy       | "work()"          | falsy          | Exit               |
      | "ready \|\| fallback()"       | "ready"   | falsy        | "fallback()"      | truthy         | Exit               |
      | "value ?? fallback()"         | "value"   | nullish      | "fallback()"      | not-nullish    | Exit               |
      | "condition ? left() : right()" | "condition" | true         | "left()"          | false          | "right()"          |
      | "ready &&= work()"            | "ready"   | truthy       | "work()"          | falsy          | Exit               |
      | "ready \|\|= fallback()"      | "ready"   | falsy        | "fallback()"      | truthy         | Exit               |
      | "value ??= fallback()"        | "value"   | nullish      | "fallback()"      | not-nullish    | Exit               |
      | "callback?.()"                | "callback" | not-nullish  | "callback()"      | nullish        | Exit               |
      | "user?.profile"               | "user"     | not-nullish  | "user.profile"    | nullish        | Exit               |

  Scenario: Keep nested Procedures outside a file graph
    Given Procedure{name: "helpers.ts", kind: File, status: Ready, source: "import type { JobSpec } from './types'; interface Job {} type JobId = string; const helper = () => work(); helper()"}
    When I visualizeControlFlow(procedure: "helpers.ts")
    Then I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: The call is represented once
    And I view GraphNode{label: "work()"} not in ControlFlowGraph: The arrow-function body remains a separate Procedure
    And I view GraphNode{label: "interface Job {}"} not in ControlFlowGraph: Erased interface syntax is omitted
    And I view GraphNode{label: "type JobId = string"} not in ControlFlowGraph: Erased type syntax is omitted
    And I view GraphNode{label: "import type { JobSpec } from './types'"} not in ControlFlowGraph: Erased type-only imports are omitted

  Scenario: Show executable class initialization without a bare class node
    Given Procedure{name: "worker.ts", kind: File, status: Ready, source: "class Worker extends makeBase() { static [key ?? fallback()]() {} static initialized = initialize(); static ready; static { register() } declare static typeOnly: string; run() { work() } }"}
    When I visualizeControlFlow(procedure: "worker.ts")
    Then I view GraphNode{label: "class Worker"} not in ControlFlowGraph: The bare declaration is omitted
    And I view GraphNode{} in ControlFlowGraph: Runtime class initialization is visible
      | label                       | kind       |
      | makeBase()                  | Executable |
      | key                         | Decision   |
      | fallback()                  | Executable |
      | static initialized = initialize()              | Executable |
      | static ready                              | Executable |
      | register()                               | Executable |
    And I view GraphNode{label: "declare static typeOnly: string"} not in ControlFlowGraph: Erased static syntax is omitted
    And I view GraphNode{label: "work()"} not in ControlFlowGraph: The method body remains a separate Procedure
