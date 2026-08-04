# Runtime observation

This context describes executable source procedures and the traces used to observe them.

## Language

### Operator

The person who selects a Procedure and inspects its control flow or execution.

### Procedure

A bounded piece of code with an identifiable start and end. A Procedure may be a file, function, or selected source range. A graph is scoped to the selected Procedure: a file graph shows a function call as `helper()`, while a function graph shows the function body's statements such as `work()`. This boundary also applies to nested function and arrow-function expressions. The graph currently accepts TypeScript source in `.ts` and `.tsx` files and requires successful TypeScript type-checking for the selected Procedure and its required dependencies; unrelated project files do not block graph generation.

### Entry

A synthetic graph node representing the start boundary of a Procedure.

### Exit

A synthetic graph node representing the end boundary of a Procedure. Normal completion and terminal abrupt statements connect to Exit without requiring edge labels; the source node identifies the kind of termination.

### Execution

One attempt to run a Procedure from its initial state to a terminal Result. While it is in progress, an Execution has one current graph node.

### Execution highlighting

A visual state applied to the current graph node of an Execution. Highlighting moves as the Execution progresses and is cleared when the Execution reaches a terminal Result; previously reached nodes are not retained as highlights.

### Control-flow graph

A directed model of every possible path through a Procedure, derived without executing the Procedure. It remains complete while an Execution highlights its current node.

### Graph node

A point in a Control-flow graph representing a Procedure boundary, executable work, or a decision.

### Control-flow transition

A directed connection between Graph nodes. Decision transitions carry their semantic outcome; sequential and terminal transitions are unlabeled.

### Explicit control flow

Control-flow transitions represented directly in a Procedure's syntax, such as branches, loops, jumps, returns, and throws.

### Executable statement

A statement in a Procedure that represents work performed during an Execution and can be shown as a graph node. Ordinary executable statements have sequential flow; explicit control-flow statements receive special node and edge behavior. A function call is represented as one executable node within the current Procedure. TypeScript-only constructs that are erased before runtime are not executable statements. An `EmptyStatement` is omitted as a node; surrounding control-flow edges remain. A `DebuggerStatement` is shown as an ordinary executable node. `await`, `yield`, and `yield*` are shown as ordinary executable nodes with sequential continuation. Runtime static field declarations are executable nodes during class initialization; `declare static` fields are omitted. Class-initialization expressions, including heritage expressions and computed names, follow the same expression-analysis rules. Bare class declarations are omitted as nodes.

### Decision node

A graph node representing a condition that chooses among possible transitions. Its outgoing edges are labeled with outcomes such as `true` and `false`; a `switch` uses one labeled edge per `case` and `default`. Sequential and terminal edges are unlabeled.

### Expression decision

A decision formed inside an executable expression. Conditional, logical, nullish, and logical-assignment operators and optional chaining create alternate evaluation paths and are represented as decision nodes. Its edges use semantic outcomes such as `truthy`/`falsy` or `nullish`/`not nullish`.

### Loop

An explicit control-flow construct whose graph includes a back edge from its body to its decision and an exit edge for the condition that stops repetition. A `for` loop exposes its initializer, condition, body, and update in that order. `for...in` and `for...of` expose an iteration decision, a zero-or-more body path, a next-item back edge, and an iteration-end exit. A `do...while` places its body before its decision, so the body executes at least once.

### Abrupt statement

An explicit control-flow statement that does not continue to the ordinary next statement. `return`, `throw`, `break`, and `continue` are abrupt statements and have explicit graph destinations. An explicit `throw` inside a `try` targets its matching `catch`. `break` targets the statement after its loop or `switch`; `continue` targets the update clause of a `for` loop or the condition of a `while`/`do...while` loop.

### Finally block

A block that every path leaving its associated `try` or `catch` traverses, including normal and abrupt exits.

### Label

A control-flow target attached to a nested statement. A Label is not separate executable work or a graph node; labeled jumps use it to resolve their destination.

### Import

A module dependency declaration outside the local Procedure's execution flow. When imports are visible, the current file may show its import declarations as contextual nodes; imported Procedures remain separate graph scopes. Import visibility is hidden by default.

### Node label

The source text represented by a graph node, accompanied by its source line range. Source text is primary; line numbers provide location context.

### With statement

A deprecated statement excluded from the Control-flow graph.

### Graph diagnostic

A clear diagnostic explaining why graph generation cannot represent a Procedure. Encountering a `With statement` or a type-checking failure fails graph generation rather than producing a partial graph.

### Source folder

The configured backend-owned folder beneath which Source files are discovered. Directory traversal outside this folder is not part of the source workspace.

### Source file

A regular TypeScript source file beneath the configured files folder. A Source file is identified by its relative forward-slash path and is owned by the Runtime Visualizer backend.

### Source revision

The immutable content identity of a Source file used to associate source, a Control-flow graph, and an Execution. A Source revision is opaque to the Operator.

### File catalog

The deterministic set of Source files discovered beneath the configured Source folder. Paths are relative, use forward slashes, and exclude symbolic links and hidden directories.

### Procedure catalog

The ordered set of Procedures discovered in a Source file. It always includes the file's Top level Procedure and includes supported functions in source order.

### Procedure revision

A Source revision together with the selected Procedure and its complete Control-flow graph. A Procedure revision is the displayed execution basis for a Run.

### File change

An observable addition, modification, or deletion of a Source file, together with the resulting Source revision when one exists.

### Execution event

An observable event emitted while an Execution progresses. A node event identifies the current Graph node; a terminal Result ends the event stream.

### Terminal Result

The final outcome of an Execution. It identifies success or failure and includes a terminal error when the Execution fails.
