---
date: YYYY-MM-DDTHH:MM:SSZ
git_commit: "[commit hash or unavailable with reason]"
branch: "[branch name or unavailable with reason]"
repository: "[repository name]"
topic: "[research topic]"
type: research
tags: [research, codebase, relevant-tag]
status: complete
---

# Research: [Research topic]

**Date**: [YYYY-MM-DDTHH:MM:SSZ]
**Git Commit**: [commit hash or unavailable with reason]
**Branch**: [branch name or unavailable with reason]
**Repository**: [repository name]

## Research Question

1. [Current-state research question]
2. [Current-state research question]

## Research Methodology (verbatim)

This document will remain objective and factual. It does not contain any recommendations or implementation suggestions.
Open questions will not ask Why things haven't been built or what should be built in the future.

There is no "implementation" section - that is intentional.

## Summary

[Explain the principal findings as a cohesive current-state narrative. Cite each factual claim at the point where it appears. Use exact repository `path/to/file.ext:line` or `path/to/file.ext:start-end` references for codebase evidence. Use full primary-source URLs for external evidence. Cite command output or observed runtime evidence with the exact command and captured result location when applicable.]

## Detailed Findings

### 1. [Takeaway that states how the system works]

[Explain the finding, its current structure, behavior, constraints, and interactions. Cite every factual claim immediately. Prefer one claim per sentence when this makes the evidence clearer.]

[Add a table, Mermaid diagram, call-stack tree, file tree, type signature, data contract, or pseudocode block when it communicates the structure more clearly than prose.]

#### Testing patterns

[Describe the current unit, integration, end-to-end, fixture, mock, snapshot, golden-output, or manual verification patterns. Cite each claim. If no tests exist, state this and cite the exhaustive inventory or search evidence.]

### 2. [Takeaway that states how another part works]

[Continue the evidence-backed narrative. Add or remove numbered findings as required by the research scope.]

#### Testing patterns

[Describe and cite the current testing pattern for this area.]

## Code References

### [Component or responsibility group]

- `path/to/file.ext:start-end` — [What the file or range defines and whether this coverage is exhaustive or representative.]
- `path/to/directory/` — [What the directory contains and the scope of the inventory.]

### External primary sources

- [Primary source title](https://example.com/exact-page) — [What current capability, constraint, behavior, or compatibility fact this source establishes.]

## Architecture Documentation

[Explain the current component boundaries, control flow, data flow, dependency relationships, and runtime model. Cite each factual claim. Include a diagram when useful. Do not recommend changes.]

## Open Questions

None.

<!-- If evidence cannot answer a current-state question, replace "None." with a numbered list. Do not ask normative or future-work questions. -->
