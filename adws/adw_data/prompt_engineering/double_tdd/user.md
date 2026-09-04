# Double-loop TDD task

## Request

{{prompt}}

## Current state

{{previous_envelope}}

## Task

Perform only the action requested for the current state. Keep the state register and inventory accurate. Do not run test commands when the current state says not to run them. Use the repository's existing conventions.

## Report

Respond with ONLY valid JSON matching `DoubleTddOutput`:

```json
{
  "status": "success",
  "summary": "<one sentence>",
  "artifacts": [],
  "acceptance_full_command": ["<program>", "<argument>"],
  "unit_full_command": ["<program>", "<argument>"],
  "focused_outer_command": ["<program>", "<argument>"],
  "focused_inner_command": ["<program>", "<argument>"],
  "inventory": [],
  "selected_example": "<example>",
  "criterion": "<criterion>",
  "oracle": "<independent oracle>",
  "high_value_test": "<test path and test name>",
  "inner_responsibility": "<responsibility and public API>",
  "inner_test": "<test path and test name>",
  "failure_kind": "plumbing",
  "handled": false,
  "acceptance_gap": false
}
```

Include only fields relevant to the current state, but always include `status` and `summary`.
