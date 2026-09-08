---
name: rpi-describe-pr
disable-model-invocation: true
description: Create or update one pull request with a reviewed description.
---

# Create or Update One Pull Request

Create or update exactly one pull request for the current branch. Keep the description in memory and send it directly to GitHub; do not create `.rpi` files, task artifacts, walkthroughs, or other local output files.

## Steps

1. **Read the template**

   Read `{SKILLBASE}/references/pr_description_template.md`.

2. **Find or create the current-branch PR**

   - Check for an associated PR: `gh pr view --json url,number,title,state,baseRefName,headRefName,commits,files 2>/dev/null`.
   - If it exists, use it.
   - Otherwise inspect `git status --short --branch`. When the current branch clearly contains the requested work, commit its relevant uncommitted changes using the repository's normal safety protocol, push the branch if needed, then create its PR with `gh pr create --base <default-branch> --head <current-branch> --title <concise-title>`.
   - Ask the user to choose an existing PR only when the current branch has no relevant work.

   **Done:** one current-branch PR has been identified or created.

3. **Review the change**

   - Read `gh pr diff {number}` in full and inspect context required to explain each change.
   - Get repository metadata with `gh repo view --json owner,name`.
   - Derive a ticket link only when it is evident from the branch name, PR title, commits, or linked issue; otherwise omit it.
   - Identify user-facing behavior, implementation choices, breaking changes, and verification evidence.

   **Done:** every changed file is accounted for in the PR description.

4. **Compose the description**

   Fill the template in memory:

   - Header links: include only the ticket link when available; omit unavailable artifact and task links.
   - User-facing changes and implementation: use GitHub PR file and line permalinks where useful.
   - Deviations: compare against an explicitly available plan or issue; otherwise state that no plan was supplied.
   - Verification: use actual commands and results.
   - Changelog: one concise line.

   **Done:** the description accurately explains the reviewed diff and contains no placeholder text.

5. **Update GitHub directly**

   Update the single PR without writing a description file: `gh pr edit {number} --body "$DESCRIPTION"`. Confirm with `gh pr view {number} --json url,body`.

   **Done:** GitHub contains the completed description for that PR.

6. **Report**

   Read `{SKILLBASE}/references/describe_pr_final_answer.md` and respond with the PR URL, title, and concise verification summary. Do not report local artifacts or saved description paths.

## Requirements

- Read the template before composing the description.
- Create or update only the current branch's one PR.
- Keep the why as clear as the what.
- Put breaking changes and migration notes prominently in the PR body.
