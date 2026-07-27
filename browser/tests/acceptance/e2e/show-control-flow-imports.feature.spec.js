// Generated from: ../features/show-control-flow-imports.feature
import { test } from "playwright-bdd";

test.describe('Show imports with a control-flow graph', () => {

  test('Hide imports by default', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "main.ts", kind: File, status: Ready, source: "import { helper } from \'./helper\'; helper()"}'); 
    await When('I visualizeControlFlow(procedure: "main.ts")'); 
    await Then('I view Import{source: "import { helper } from \'./helper\'"} not in ControlFlowGraph: Imports do not appear by default'); 
    await And('I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: Local flow remains visible'); 
  });

  test('Show current-file imports as context', async ({ Given, When, Then, And }) => { 
    await Given('current:Procedure{name: "main.ts", kind: File, status: Ready, source: "import { helper } from \'./helper\'; helper()"}'); 
    await And('imported:Procedure{name: "helper.ts", kind: File, status: Ready, source: "export function helper() { work() }"}'); 
    await And('Import{visibility: Visible}'); 
    await When('I visualizeControlFlow(procedure: "main.ts")'); 
    await Then('I view Import{source: "import { helper } from \'./helper\'"} in ControlFlowGraph: The current file\'s dependency context is visible'); 
    await And('I view ControlFlowTransition{from: "import { helper } from \'./helper\'", to: "helper()"} not in ControlFlowGraph: Contextual imports do not become local execution flow'); 
    await And('I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: The local call remains one node'); 
    await And('I view GraphNode{label: "work()"} not in ControlFlowGraph: The imported Procedure is not expanded'); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('../features/show-control-flow-imports.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":7,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":8,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"main.ts\", kind: File, status: Ready, source: \"import { helper } from './helper'; helper()\"}"},{"pwStepLine":8,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"main.ts\")"},{"pwStepLine":9,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"Then I view Import{source: \"import { helper } from './helper'\"} not in ControlFlowGraph: Imports do not appear by default"},{"pwStepLine":10,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: \"helper()\", kind: Executable} in ControlFlowGraph: Local flow remains visible"}]},
  {"pwTestLine":13,"pickleLine":13,"tags":[],"steps":[{"pwStepLine":14,"gherkinStepLine":14,"keywordType":"Context","textWithKeyword":"Given current:Procedure{name: \"main.ts\", kind: File, status: Ready, source: \"import { helper } from './helper'; helper()\"}"},{"pwStepLine":15,"gherkinStepLine":15,"keywordType":"Context","textWithKeyword":"And imported:Procedure{name: \"helper.ts\", kind: File, status: Ready, source: \"export function helper() { work() }\"}"},{"pwStepLine":16,"gherkinStepLine":16,"keywordType":"Context","textWithKeyword":"And Import{visibility: Visible}"},{"pwStepLine":17,"gherkinStepLine":17,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"main.ts\")"},{"pwStepLine":18,"gherkinStepLine":18,"keywordType":"Outcome","textWithKeyword":"Then I view Import{source: \"import { helper } from './helper'\"} in ControlFlowGraph: The current file's dependency context is visible"},{"pwStepLine":19,"gherkinStepLine":19,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"import { helper } from './helper'\", to: \"helper()\"} not in ControlFlowGraph: Contextual imports do not become local execution flow"},{"pwStepLine":20,"gherkinStepLine":20,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: \"helper()\", kind: Executable} in ControlFlowGraph: The local call remains one node"},{"pwStepLine":21,"gherkinStepLine":21,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: \"work()\"} not in ControlFlowGraph: The imported Procedure is not expanded"}]},
]; // bdd-data-end