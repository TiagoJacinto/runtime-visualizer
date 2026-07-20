# Runtime observation

This context describes executable source procedures and the traces used to observe them.

## Language

### Procedure

A source program that can be executed as one unit.
_Avoid_: File, when referring to the executable thing.

### Execution

One attempt to run a Procedure from its initial state to a terminal Result.

### Execution event

An observable point reached during an Execution, such as a statement or a branch evaluation. An event is Active while the Execution is at that point.

### Trace

The ordered record of Execution events produced by one Execution.