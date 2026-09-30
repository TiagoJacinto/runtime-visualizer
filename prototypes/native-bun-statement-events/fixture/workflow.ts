interface WorkflowInput {
  approval: boolean;
  changes: string[];
}

interface WorkflowResult {
  status: "approved" | "waiting";
  summary: string;
}

// oxlint-disable-next-line eslint/func-style -- The CFG analyzer selects named function declarations.
export async function executeWorkflow(
  input: WorkflowInput
): Promise<WorkflowResult> {
  const changedFiles = input.changes.map((file) => file.toLowerCase());
  await Promise.resolve();
  let checkedChanges = 0;
  // oxlint-disable-next-line typescript/prefer-for-of -- Exercise initializer, condition, and update CFG nodes.
  for (let index = 0; index < changedFiles.length; index += 1) {
    const changedFile = changedFiles[index] ?? "";
    checkedChanges += changedFile.length > 0 ? 1 : 0;
  }

  let attempts = 0;
  while (attempts < 2) {
    attempts += 1;
  }

  const needsApproval = changedFiles.length > 0;
  if (input.approval && needsApproval) {
    return {
      status: "approved",
      summary: `approved ${checkedChanges} local change after ${attempts} checks`,
    };
  }

  return {
    status: "waiting",
    summary: "no approved changes",
  };
}
