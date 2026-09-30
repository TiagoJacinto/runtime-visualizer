import { executeWorkflow } from "./workflow.ts";

const result = await executeWorkflow({
  approval: true,
  changes: ["src/example.ts"],
});

console.log(JSON.stringify(result));
