## Request

{{prompt}}

## Previous agent envelope

{{previous_envelope}}

## Report

Return only valid JSON:

```json
{
  "status": "success",
  "summary": "Completed the requested design artifact.",
  "artifacts": [".rpi/problems/.../NN-artifact-description.md"],
  "notes_for_next_agent": "The artifact is ready for the next phase."
}
```
