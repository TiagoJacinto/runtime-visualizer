# Native Bun statement events prototype

This disposable fixture tests whether a Bun preload can register a runtime plugin that instruments an entry module and its imported TypeScript module, emits live events with Runtime Visualizer CFG node IDs, and retains that same run's events in order for replay.

The preload calls Runtime Visualizer's existing `analyseFileProcedure` for each fixture module. It keys events by source file, procedure, and CFG node ID because node IDs are only unique within one procedure. The fixture exercises an `await` statement, `return`, `if`, a classic `for` loop's initializer/condition/body/update, and a `while` loop's repeated condition. It checks that branch and statement events match the generated CFG nodes.

The workflow fixture uses only in-memory data and `Promise.resolve()`. It does not access the Local Agent Factory checkout, SQLite, the network, providers, external files, child processes, or deployment tools. It does not invoke a real workflow.

Run from the repository root:

```sh
bash prototypes/native-bun-statement-events/run.sh
```

The script runs once without instrumentation and once with the preload. It requires matching stdout, verifies the live events against the retained replay, and checks expected loop-condition visit counts. Trace events go to stderr.

The preload checks that every source-backed CFG node in each analyzed fixture procedure has a scheduled instrumentation point. The executed path covers `await`, `return`, `if`, a classic `for`, and `while`; loop-condition events repeat at runtime. It does not yet verify all syntax forms supported by the analyzer. In particular, a `for...in` or `for...of` iteration decision needs an event for each iterator step, while this prototype only instruments evaluation of the iterable expression. It does not connect to the Runtime Visualizer UI, use a durable replay store, or bind events to an immutable analysis revision. Process termination, thrown errors, child processes, and transport behavior remain untested. Synchronous stderr writes can affect timing. Matching stdout for this deterministic fixture does not prove full behavioral neutrality.
