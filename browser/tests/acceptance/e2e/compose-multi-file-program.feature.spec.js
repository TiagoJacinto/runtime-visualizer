// Generated from: ../features/compose-multi-file-program.feature
import { test } from "playwright-bdd";

test.describe('Analyze a complete TypeScript program', () => {

  test('Resolve an import from another file Procedure', async ({ Given, When, Then, And }) => { 
    await Given('selected:Procedure{name: "main.ts", kind: File, status: Ready, source: "import { helper } from \'./helper\'; helper()"}'); 
    await And('dependency:Procedure{name: "helper.ts", kind: File, status: Ready, source: "export function helper() {}"}'); 
    await When('I visualizeControlFlow(procedure: "main.ts")'); 
    await Then('I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: The selected Procedure retains its executable call'); 
    await And('I view GraphDiagnostic{reason: "Required dependency could not be resolved", dependency: "helper.ts"} not in ControlFlowGraph: The imported Procedure resolves successfully'); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('../features/compose-multi-file-program.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":7,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":8,"keywordType":"Context","textWithKeyword":"Given selected:Procedure{name: \"main.ts\", kind: File, status: Ready, source: \"import { helper } from './helper'; helper()\"}"},{"pwStepLine":8,"gherkinStepLine":9,"keywordType":"Context","textWithKeyword":"And dependency:Procedure{name: \"helper.ts\", kind: File, status: Ready, source: \"export function helper() {}\"}"},{"pwStepLine":9,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"main.ts\")"},{"pwStepLine":10,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"helper()\", kind: Executable} in ControlFlowGraph: The selected Procedure retains its executable call"},{"pwStepLine":11,"gherkinStepLine":12,"keywordType":"Outcome","textWithKeyword":"And I view GraphDiagnostic{reason: \"Required dependency could not be resolved\", dependency: \"helper.ts\"} not in ControlFlowGraph: The imported Procedure resolves successfully"}]},
]; // bdd-data-end