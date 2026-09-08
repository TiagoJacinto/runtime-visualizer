# Robustness

## Durable execution across backend restarts

Active executions are currently process-bound: a backend restart ends each active run as `Failed`. Browser reloads, browser disconnects, and opening another browser do not stop active runs; the server-owned active-run registry makes them recoverable while the backend remains running.

A future robustness improvement should make executions durable across backend restarts. It requires a persistent job record, explicit execution checkpoints or a safe restart semantic, recovery of active-run state, and terminal-event delivery after recovery. Do not present a restarted Procedure as a continuation unless its execution semantics are proven equivalent. ExecutionManager terminates in-process workers during application shutdown, releases their revision leases, and does not resume them on the next startup; persisted analysis revisions remain available for a new run.
