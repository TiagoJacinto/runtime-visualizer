# Retry policy

## Rule

Retry only a failure that is likely temporary and whose repeated operation is safe. A `catch` does not imply retry; surface permanent failures to the Operator with an actionable error.

| Situation | Automatic policy | Reason |
| --- | --- | --- |
| Invalid input, contract validation, authentication, or authorization failure | Never retry | Repeating cannot change the outcome. |
| Non-idempotent command, such as starting or cancelling an Execution | Never retry | Repeating can create or change the wrong resource. Require an explicit Operator action. |
| Request-response workspace resource read | Never retry | The QueryClient reports the error; the Operator can use Refresh after correcting the cause. |
| Resumable Workspace SSE connection | Retry five times after 250ms, 500ms, 1s, 2s, and 4s | A connection can fail transiently. Resume from the last event cursor, reset the budget after a received event, and show reconnecting state. |
| CI dependency installation | Retry three times after 1s and 2s | Registry downloads can fail transiently; the lockfile still fixes the resolved dependency graph. |
| Optional external PR enrichment | Retry once, then warn without blocking merge | An unavailable diagram service does not change the application artifact. |

## Implementation rules

- Keep the retry policy beside the boundary that owns the operation.
- Bound retries and make the delay explicit; never retry indefinitely.
- Preserve recovery context when the protocol supports it, such as the Workspace SSE cursor.
- Reset a connection retry budget only after meaningful progress.
- Keep a required quality gate required after its installation retry budget is exhausted.
- Make optional integrations advisory rather than weakening application quality gates.
