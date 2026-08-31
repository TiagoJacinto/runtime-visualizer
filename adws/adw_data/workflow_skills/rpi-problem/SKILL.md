---
name: rpi-problem
description: Create the local RPI problem record for an inline request or a Linear, Beads, or GitHub issue.
---

# Create an RPI problem

Create one problem directory and one `.rpi/problems/[SLUG]/problem.md` file. This skill records problem metadata only. It does not create a worktree, fetch an issue, or start a workflow.

## 1. Gather problem metadata

Collect these values. Ask one question at a time when a value is missing.

| Field          | Allowed values                           | Default or rule                                      |
| -------------- | ---------------------------------------- | ---------------------------------------------------- |
| `issue-source` | `inline`, `linear`, `beads`, `github`    | Use `inline` when the request has no external issue. |
| `name`         | A short problem name                     | Required.                                            |
| `description`  | The problem outcome and relevant context | Required.                                            |
| `slug`         | URL-friendly text                        | Generate from `name`; the user may override it.      |
| `workflow`     | `rpi`, `prd-oriented`, `oneshot`         | Use `rpi` unless the user selects another workflow.  |
| `worktrees`    | `never`, `later`, `now`                  | Use `later` unless the user selects another value.   |

For `linear`, `beads`, or `github`, ask for the issue identifier or URL when it is not already present. Keep that reference in the problem body. Use information already supplied by the invoking skill or request. Leave external-service access to the caller.

**Completion criterion:** all required values and any external issue reference are known.

## 2. Generate and validate the slug

When the user does not provide a slug, run the deterministic helper:

```text
Bash(sh {SKILLBASE}/scripts/generate-slug.sh "[NAME]")
```

When the user provides a slug, run the validation helper:

```text
Bash(sh {SKILLBASE}/scripts/validate-slug.sh "[SLUG]")
```

Continue only when the selected script exits successfully. The slug must contain only lowercase letters, numbers, and single hyphens, with no leading or trailing hyphen. It must be safe to use as a directory name and URL path.

If `.rpi/problems/[SLUG]/problem.md` already exists, preserve it. Report the existing path and ask the user to choose a different slug or explicitly replace the file.

**Completion criterion:** the slug is valid and the destination is available or explicitly approved for replacement.

## 3. Write the problem file

Create the directory `.rpi/problems/[SLUG]/` and write `problem.md` with this frontmatter:

```yaml
---
issue-source: inline
name: Example problem
slug: example-problem
description: Add the requested behavior and verify its user-facing result.
workflow: rpi
worktrees: later
---
```

Use the selected values. Quote YAML values when they contain `:`, `#`, `{`, `}`, `[`, `]`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, or a leading YAML boolean/null value.

After the frontmatter, write:

```markdown
# [Name]

[Description]

## Issue

- Source: `[issue-source]`
- Reference: `[issue identifier or URL, when provided]`

## Workflow

- Workflow: `[workflow]`
- Worktrees: `[worktrees]`
```

Keep the body short. The frontmatter is the canonical problem configuration.

**Completion criterion:** `.rpi/problems/[SLUG]/problem.md` exists with valid frontmatter and all requested metadata.

## 4. Report completion

Report:

- The problem path.
- The generated slug.
- The selected workflow.
- The selected worktree mode.
- The next skill or command implied by the workflow:
  - `rpi` → continue with the RPI research phase.
  - `prd-oriented` → continue with `rpi-create-prd`.
  - `oneshot` → implement directly after reviewing the problem.
