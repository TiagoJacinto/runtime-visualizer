# Runtime Visualizer glossary

## Analysis revision

The content-addressed identifier for one immutable workspace manifest. It identifies the exact inputs used to return diagnostics and a control-flow graph (CFG), and it is also the revision accepted by an execution request.

## Workspace manifest

The selected source file, every transitively resolved source file loaded by its TypeScript `Program`, and every compiler or analysis configuration value that can affect diagnostics, CFG construction, or execution. Input paths are sorted and paired with their content hashes before deriving the manifest identity.

A source change creates a new manifest. It cannot change the diagnostics, CFG, or execution already pinned to an earlier revision.

## Immutable dependency snapshot

The stored source map and selected Procedure CFG for a workspace manifest. Execution acquires this snapshot and uses it for its entire lifetime, including when a source file has subsequently changed or been deleted. Dependency-DAG invalidation may optimize recomputation, but it never changes the revision boundary.
