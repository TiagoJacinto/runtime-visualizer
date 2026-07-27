// Generated from: ../features/diagnose-control-flow-graph.feature
import { test } from "playwright-bdd";

test.describe('Diagnose control-flow graph generation', () => {

  test('Reject a selected Procedure that fails type-checking', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "broken.ts", kind: File, status: TypeError, source: "const count: number = \'many\'; work()"}'); 
    await When('I visualizeControlFlow(procedure: "broken.ts")'); 
    await Then('I view GraphDiagnostic{procedure: "broken.ts", reason: "Type checking failed"} in Procedure: The failure is explained'); 
    await And('I view ControlFlowGraph{procedure: "broken.ts"} not in Procedure: No partial graph is presented'); 
  });

  test('Reject a required dependency that fails type-checking', async ({ Given, When, Then, And }) => { 
    await Given('selected:Procedure{name: "main.ts", kind: File, status: Ready, source: "import { count } from \'./count\'; work(count)"}'); 
    await And('required:Procedure{name: "count.ts", kind: File, status: TypeError, source: "export const count: number = \'many\'"}'); 
    await When('I visualizeControlFlow(procedure: "main.ts")'); 
    await Then('I view GraphDiagnostic{procedure: "main.ts", dependency: "count.ts", reason: "Type checking failed"} in Procedure: The dependency failure is explained'); 
    await And('I view ControlFlowGraph{procedure: "main.ts"} not in Procedure: No partial graph is presented'); 
  });

  test('Ignore a type error in an unrelated Procedure', async ({ Given, When, Then, And }) => { 
    await Given('selected:Procedure{name: "main.ts", kind: File, status: Ready, source: "work()"}'); 
    await And('unrelated:Procedure{name: "broken.ts", kind: File, status: TypeError, source: "const count: number = \'many\'"}'); 
    await When('I visualizeControlFlow(procedure: "main.ts")'); 
    await Then('I view ControlFlowGraph{procedure: "main.ts"} in Procedure: Unrelated diagnostics do not block the selected Procedure'); 
    await And('I view GraphDiagnostic{procedure: "main.ts"} not in Procedure: Successful generation has no failure diagnostic'); 
  });

  test('Reject syntactically invalid source', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "invalid.ts", kind: File, status: SyntaxError, source: "if (ready { work() }"}'); 
    await When('I visualizeControlFlow(procedure: "invalid.ts")'); 
    await Then('I view GraphDiagnostic{procedure: "invalid.ts", reason: "Syntax is invalid"} in Procedure: The syntax failure is explained'); 
    await And('I view ControlFlowGraph{procedure: "invalid.ts"} not in Procedure: No partial graph is presented'); 
  });

  test('Reject a With statement', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "legacy.ts", kind: File, status: Unsupported, source: "with (settings) { work() }"}'); 
    await When('I visualizeControlFlow(procedure: "legacy.ts")'); 
    await Then('I view GraphDiagnostic{procedure: "legacy.ts", reason: "With statement is unsupported"} in Procedure: Unsupported syntax is explained'); 
    await And('I view ControlFlowGraph{procedure: "legacy.ts"} not in Procedure: No partial graph is presented'); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('../features/diagnose-control-flow-graph.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":7,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":8,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"broken.ts\", kind: File, status: TypeError, source: \"const count: number = 'many'; work()\"}"},{"pwStepLine":8,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"broken.ts\")"},{"pwStepLine":9,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"Then I view GraphDiagnostic{procedure: \"broken.ts\", reason: \"Type checking failed\"} in Procedure: The failure is explained"},{"pwStepLine":10,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowGraph{procedure: \"broken.ts\"} not in Procedure: No partial graph is presented"}]},
  {"pwTestLine":13,"pickleLine":13,"tags":[],"steps":[{"pwStepLine":14,"gherkinStepLine":14,"keywordType":"Context","textWithKeyword":"Given selected:Procedure{name: \"main.ts\", kind: File, status: Ready, source: \"import { count } from './count'; work(count)\"}"},{"pwStepLine":15,"gherkinStepLine":15,"keywordType":"Context","textWithKeyword":"And required:Procedure{name: \"count.ts\", kind: File, status: TypeError, source: \"export const count: number = 'many'\"}"},{"pwStepLine":16,"gherkinStepLine":16,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"main.ts\")"},{"pwStepLine":17,"gherkinStepLine":17,"keywordType":"Outcome","textWithKeyword":"Then I view GraphDiagnostic{procedure: \"main.ts\", dependency: \"count.ts\", reason: \"Type checking failed\"} in Procedure: The dependency failure is explained"},{"pwStepLine":18,"gherkinStepLine":18,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowGraph{procedure: \"main.ts\"} not in Procedure: No partial graph is presented"}]},
  {"pwTestLine":21,"pickleLine":20,"tags":[],"steps":[{"pwStepLine":22,"gherkinStepLine":21,"keywordType":"Context","textWithKeyword":"Given selected:Procedure{name: \"main.ts\", kind: File, status: Ready, source: \"work()\"}"},{"pwStepLine":23,"gherkinStepLine":22,"keywordType":"Context","textWithKeyword":"And unrelated:Procedure{name: \"broken.ts\", kind: File, status: TypeError, source: \"const count: number = 'many'\"}"},{"pwStepLine":24,"gherkinStepLine":23,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"main.ts\")"},{"pwStepLine":25,"gherkinStepLine":24,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowGraph{procedure: \"main.ts\"} in Procedure: Unrelated diagnostics do not block the selected Procedure"},{"pwStepLine":26,"gherkinStepLine":25,"keywordType":"Outcome","textWithKeyword":"And I view GraphDiagnostic{procedure: \"main.ts\"} not in Procedure: Successful generation has no failure diagnostic"}]},
  {"pwTestLine":29,"pickleLine":27,"tags":[],"steps":[{"pwStepLine":30,"gherkinStepLine":28,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"invalid.ts\", kind: File, status: SyntaxError, source: \"if (ready { work() }\"}"},{"pwStepLine":31,"gherkinStepLine":29,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"invalid.ts\")"},{"pwStepLine":32,"gherkinStepLine":30,"keywordType":"Outcome","textWithKeyword":"Then I view GraphDiagnostic{procedure: \"invalid.ts\", reason: \"Syntax is invalid\"} in Procedure: The syntax failure is explained"},{"pwStepLine":33,"gherkinStepLine":31,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowGraph{procedure: \"invalid.ts\"} not in Procedure: No partial graph is presented"}]},
  {"pwTestLine":36,"pickleLine":33,"tags":[],"steps":[{"pwStepLine":37,"gherkinStepLine":34,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"legacy.ts\", kind: File, status: Unsupported, source: \"with (settings) { work() }\"}"},{"pwStepLine":38,"gherkinStepLine":35,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"legacy.ts\")"},{"pwStepLine":39,"gherkinStepLine":36,"keywordType":"Outcome","textWithKeyword":"Then I view GraphDiagnostic{procedure: \"legacy.ts\", reason: \"With statement is unsupported\"} in Procedure: Unsupported syntax is explained"},{"pwStepLine":40,"gherkinStepLine":37,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowGraph{procedure: \"legacy.ts\"} not in Procedure: No partial graph is presented"}]},
]; // bdd-data-end