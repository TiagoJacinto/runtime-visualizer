export const meta = {
  name: "implement_xslow",
  description: "Implement issue #6 with worktree isolation, double-loop TDD, review, push, and PR creation",
  phases: [
    { title: "Preflight" },
    { title: "Explore" },
    { title: "Agree seams" },
    { title: "Implement" },
    { title: "Review" },
    { title: "Publish" },
  ],
};

const issue = {
  url: "https://github.com/TiagoJacinto/runtime-visualizer/issues/6",
  title: "Graph diagnostics",
  parent: "#1 — Visualize a TypeScript Procedure",
  blockedBy: "#2 — Render a basic Procedure Control-flow graph",
  requirements: [
    "Type-checking failures in the selected Procedure or required dependencies produce diagnostics.",
    "Syntax failures and unsupported `with` statements produce diagnostics.",
    "Failed generation never exposes a partial Control-flow graph.",
    "Unrelated Procedure diagnostics do not prevent successful generation.",
    "Browser-level feature coverage verifies each diagnostic category.",
  ],
};

const issueUrl =
  args && typeof args.issueUrl === "string" ? args.issueUrl : issue.url;
const issueContext = JSON.stringify({ ...issue, url: issueUrl });

const discoverySchema = {
  type: "object",
  properties: {
    findings: { type: "string" },
    relevantPaths: { type: "array", items: { type: "string" } },
    proposedSeams: { type: "array", items: { type: "string" } },
    testCommands: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
  },
  required: ["findings", "relevantPaths", "proposedSeams", "testCommands", "unknowns"],
};

phase("Preflight");
const preflight = await agent(
  `Inspect the current repository working tree without editing it. Determine whether there are uncommitted changes, the current branch, and the changed paths. Do not commit or reset anything. Return a concise summary. The eventual implementation concerns this issue:\n${issueContext}`,
  {
    label: "preflight-status",
    schema: {
      type: "object",
      properties: {
        clean: { type: "boolean" },
        branch: { type: "string" },
        changedFiles: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
      },
      required: ["clean", "branch", "changedFiles", "summary"],
    },
  },
);

if (preflight === null) {
  return { status: "blocked", stage: "preflight", reason: "Could not inspect the working tree." };
}

if (!preflight.clean) {
  let approved = false;
  try {
    approved = Boolean(
      await checkpoint(
        `The current branch has uncommitted changes in ${preflight.changedFiles.join(", ") || "unknown paths"}. Commit these existing changes atomically before creating the implementation worktree?`,
        { kind: "confirm", default: false, headless: "abort" },
      ),
    );
  } catch (error) {
    return {
      status: "blocked",
      stage: "preflight",
      reason: "Approval for committing existing changes was not available.",
      error: String(error),
    };
  }

  if (!approved) {
    return {
      status: "blocked",
      stage: "preflight",
      reason: "Existing uncommitted changes were not approved for atomic commits.",
      changedFiles: preflight.changedFiles,
    };
  }

  const committed = await agent(
    `In the current repository (not a new implementation worktree), commit only the pre-existing uncommitted changes. Inspect the diff, group unrelated changes into separate atomic commits, use clear conventional commit messages, and do not alter the content to make unrelated improvements. Verify the working tree is clean afterward. Return the commit subjects and final status.\nExisting status: ${JSON.stringify(preflight)}`,
    {
      label: "commit-existing-changes",
      schema: {
        type: "object",
        properties: {
          committed: { type: "boolean" },
          commits: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        },
        required: ["committed", "commits", "summary"],
      },
    },
  );

  if (committed === null || !committed.committed) {
    return {
      status: "blocked",
      stage: "preflight",
      reason: "The approved pre-existing changes were not committed atomically.",
      commitResult: committed,
    };
  }
}

phase("Explore");
const discoveryUnits = [
  {
    id: "domain-and-architecture",
    prompt:
      "Map the domain and architecture relevant to Procedure selection, TypeScript parsing/type-checking, graph generation, diagnostics, and graph exposure. Read CONTEXT.md, docs/agents/domain.md, features/, and the existing implementation. Identify the public application seam and observation seam; do not edit.",
  },
  {
    id: "acceptance-and-browser-tests",
    prompt:
      "Inventory the acceptance specs, browser test runner, fixtures, and existing high-value tests. Map each issue criterion to an existing or missing browser-level scenario and exact focused/full commands. Do not edit.",
  },
  {
    id: "dependency-and-failure-paths",
    prompt:
      "Trace current graph generation and failure paths, including TypeScript diagnostics, syntax errors, unsupported `with`, partial graph state, and unrelated Procedure diagnostics. Find likely lower-level responsibilities and seams for typical unit tests. Do not edit.",
  },
];

const discoveryResults = await parallel(
  discoveryUnits.map((unit, index) => () =>
    agent(
      `You are a read-only investigator. Work in the current repository and inspect source, tests, and documentation. The target issue is:\n${issueContext}\n\nYour assigned investigation (${unit.id}): ${unit.prompt}\nReturn evidence with exact paths, relevant commands, proposed seams, and unresolved questions.`,
      { label: `explore:${index}:${unit.id}`, schema: discoverySchema },
    ),
  ),
);

const discoveryLedger = discoveryUnits.map((unit, index) => ({
  id: unit.id,
  status: discoveryResults[index] === null ? "missing" : "complete",
  result: discoveryResults[index],
}));

const plan = await agent(
  `Synthesize a concrete implementation plan for issue #6 from the complete investigation ledger below. Treat missing entries as missing coverage, not negative evidence. Reconcile the architecture and testing model, identify exactly one public action seam and all observation seams, map one acceptance scenario to each diagnostic category plus the no-partial-graph and unrelated-diagnostics behaviors, and list the smallest likely lower-level responsibilities for inner TDD loops. Include exact focused commands when known. Do not edit.\n\nIssue:\n${issueContext}\n\nInvestigation ledger:\n${JSON.stringify(discoveryLedger)}`,
  {
    label: "synthesize-implementation-plan",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        seams: { type: "array", items: { type: "string" } },
        acceptanceScenarios: { type: "array", items: { type: "string" } },
        implementationSteps: { type: "array", items: { type: "string" } },
        testCommands: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "seams", "acceptanceScenarios", "implementationSteps", "testCommands", "risks"],
    },
  },
);

if (plan === null) {
  return {
    status: "blocked",
    stage: "explore",
    reason: "Could not synthesize an implementation plan.",
    discoveryLedger,
  };
}

phase("Agree seams");
let seamsApproved = false;
try {
  seamsApproved = Boolean(
    await checkpoint(
      `Review and approve the proposed seams and acceptance scope before implementation.\n\n${JSON.stringify(plan, null, 2)}`,
      { kind: "confirm", default: false, headless: "abort" },
    ),
  );
} catch (error) {
  return {
    status: "blocked",
    stage: "agree-seams",
    reason: "Seam approval was not available.",
    plan,
    error: String(error),
  };
}

if (!seamsApproved) {
  return { status: "blocked", stage: "agree-seams", reason: "The proposed seams were not approved.", plan };
}

phase("Implement");
const implementation = await agent(
  "Implement issue #6 in a NEW git worktree. You are the sole implementation writer. The worktree must remain available after this call for review; do not remove it, push it, or create the PR yet. Return its absolute path and branch name.\n\nIssue:\n${issueContext}\n\nApproved plan:\n${JSON.stringify(plan)}\n\nRequired process:\n- Read and follow /home/tiago/.agents/skills/custom-double-tdd/SKILL.md, including the testing model and custom-Gherkin rules it references. Use the approved public action and observation seams; ask no new broad design questions.\n- Implement one acceptance scenario at a time. Establish outer red with the narrowest acceptance/browser command, then use nested typical-unit red/green loops for each lower-level responsibility.\n- Run typechecking regularly, run the focused test file after each meaningful change, run the full unit/acceptance suite once at the end, and record the exact commands and outcomes.\n- Keep failure behavior transactional: failed generation must not expose partial graphs, while diagnostics unrelated to the selected Procedure must not block a valid graph.\n- Preserve existing behavior outside the issue and avoid speculative abstractions.\n- Use atomic commits if that helps preserve milestones, but leave the final worktree and branch intact for the review/publish stage.\n\nWhen done, report status, absolute worktree path, branch, changed paths, tests/typechecks run, and residual risks. If blocked, leave useful diagnostics and report why.",
  {
    label: "implement-issue-6",
    isolation: "worktree",
    schema: {
      type: "object",
      properties: {
        status: { type: "string" },
        worktreePath: { type: "string" },
        branch: { type: "string" },
        changedPaths: { type: "array", items: { type: "string" } },
        focusedTests: { type: "array", items: { type: "string" } },
        typechecks: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["status", "worktreePath", "branch", "changedPaths", "focusedTests", "typechecks", "notes"],
    },
  },
);

if (implementation === null || implementation.status !== "complete" || !implementation.worktreePath) {
  return {
    status: "blocked",
    stage: "implement",
    reason: "Implementation did not complete in a usable worktree.",
    implementation,
  };
}

phase("Review");
const reviewUnits = [
  {
    id: "standards",
    prompt:
      "Read and apply /home/tiago/.agents/skills/code-review/SKILL.md Standards axis. Inspect the implementation worktree diff from the base branch, including uncommitted changes. Read repository standards and report documented violations plus labelled Fowler-smell judgement calls, with file/hunk evidence. Do not edit.",
  },
  {
    id: "spec",
    prompt:
      "Read and apply /home/tiago/.agents/skills/code-review/SKILL.md Spec axis. Inspect the implementation worktree diff from the base branch, including uncommitted changes. Compare it against every issue criterion and report missing/partial behavior, scope creep, and suspicious implementations with file/hunk evidence. Do not edit.",
  },
];

const reviewResults = await parallel(
  reviewUnits.map((unit, index) => () =>
    agent(
      "Perform a read-only code review in the implementation worktree at " +
        implementation.worktreePath +
        ". Always use that absolute path (or cd there) and compare against the repository's pre-implementation base branch. The issue is:\n" +
        issueContext +
        "\n\nYour review assignment (" +
        unit.id +
        "): " +
        unit.prompt +
        "\nReturn findings under the requested axis, prioritised by severity, and say explicitly when the axis passes. Do not modify files, commit, push, or create a PR.",
      { label: "review:" + index + ":" + unit.id },
    ),
  ),
);

const reviewLedger = reviewUnits.map((unit, index) => ({
  id: unit.id,
  status: reviewResults[index] === null ? "missing" : "complete",
  result: reviewResults[index],
}));

phase("Publish");
const publication = await agent(
  "Finish and publish the issue #6 implementation in the existing worktree at ${implementation.worktreePath}. You are the sole writer for this stage.\n\nIssue:\n${issueContext}\n\nImplementation report:\n${JSON.stringify(implementation)}\n\nReview ledger:\n${JSON.stringify(reviewLedger)}\n\nRequired finish process:\n- Read /home/tiago/.agents/skills/code-review/SKILL.md and address every valid review finding. Re-check the issue criteria and preserve the approved seams.\n- Run the focused tests for changed behavior, typechecking, and then the full test suite once at the end. Do not declare success if any required test or typecheck is failing.\n- Inspect the final diff and create atomic commits for the implementation and review fixes.\n- In the implementation worktree, push the checked-out branch to origin and set its upstream if needed (git push -u origin HEAD). Do not force-push.\n- Determine the repository default branch with git/GitHub tooling, then create a pull request against that default branch using gh pr create, including a concise summary, test commands/results, and a reference to issue #6. Do not merge the PR.\n- Return the exact branch, commit subjects, default base branch, PR URL, test/typecheck results, and any residual risks. If credentials, remote configuration, conflicts, or tests prevent publication, stop without destructive recovery and report the blocker clearly.",
  {
    label: "publish-implementation",
    schema: {
      type: "object",
      properties: {
        status: { type: "string" },
        worktreePath: { type: "string" },
        branch: { type: "string" },
        commits: { type: "array", items: { type: "string" } },
        baseBranch: { type: "string" },
        prUrl: { type: "string" },
        tests: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["status", "worktreePath", "branch", "commits", "baseBranch", "prUrl", "tests", "notes"],
    },
  },
);

return {
  status: publication === null ? "blocked" : publication.status,
  issue: issueUrl,
  plan,
  discoveryLedger,
  implementation,
  reviewLedger,
  publication,
};
