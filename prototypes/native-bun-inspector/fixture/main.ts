import { visit, sourceProbe, stackProbe } from "./workflow.ts";

console.log(JSON.stringify({
  source: sourceProbe.toString(),
  stack: stackProbe(),
  visits: [visit(true), visit(false)],
}));
