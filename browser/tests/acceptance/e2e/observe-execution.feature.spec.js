// Generated from: ../features/observe-execution.feature
import { test } from "playwright-bdd";

test.describe('Highlight procedure execution in a control-flow graph', () => {

  test('Highlight the active node while execution follows one branch', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "classify.ts", kind: File, status: Ready, source: "prepare(); if (ready) { work() } else { wait() }"}'); 
    await When('I run(procedure: "classify.ts")'); 
    await Then('I view GraphNode{} in ControlFlowGraph: The complete possible flow is visible', {"dataTable":{"rows":[{"cells":[{"value":"label"},{"value":"kind"}]},{"cells":[{"value":"Entry"},{"value":"Entry"}]},{"cells":[{"value":"prepare()"},{"value":"Executable"}]},{"cells":[{"value":"ready"},{"value":"Decision"}]},{"cells":[{"value":"work()"},{"value":"Executable"}]},{"cells":[{"value":"wait()"},{"value":"Executable"}]},{"cells":[{"value":"Exit"},{"value":"Exit"}]}]}}); 
    await And('I await view ExecutionHighlighting{node: "prepare()"} in ControlFlowGraph: The preparation node is highlighted'); 
    await And('I await view ExecutionHighlighting{node: "ready"} in ControlFlowGraph: The decision node is highlighted'); 
    await And('I await view ExecutionHighlighting{node: "work()"} in ControlFlowGraph: The selected work node is highlighted'); 
    await And('I view GraphNode{label: "wait()"} in ControlFlowGraph: The unselected possible path remains visible'); 
    await And('I view ExecutionHighlighting{node: "wait()"} not in ControlFlowGraph: The unselected path is not highlighted'); 
    await And('I view ExecutionHighlighting{} not in ControlFlowGraph: No node remains highlighted after completion'); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('../features/observe-execution.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":7,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":8,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"classify.ts\", kind: File, status: Ready, source: \"prepare(); if (ready) { work() } else { wait() }\"}"},{"pwStepLine":8,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"When I run(procedure: \"classify.ts\")"},{"pwStepLine":9,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{} in ControlFlowGraph: The complete possible flow is visible"},{"pwStepLine":10,"gherkinStepLine":18,"keywordType":"Outcome","textWithKeyword":"And I await view ExecutionHighlighting{node: \"prepare()\"} in ControlFlowGraph: The preparation node is highlighted"},{"pwStepLine":11,"gherkinStepLine":19,"keywordType":"Outcome","textWithKeyword":"And I await view ExecutionHighlighting{node: \"ready\"} in ControlFlowGraph: The decision node is highlighted"},{"pwStepLine":12,"gherkinStepLine":20,"keywordType":"Outcome","textWithKeyword":"And I await view ExecutionHighlighting{node: \"work()\"} in ControlFlowGraph: The selected work node is highlighted"},{"pwStepLine":13,"gherkinStepLine":21,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: \"wait()\"} in ControlFlowGraph: The unselected possible path remains visible"},{"pwStepLine":14,"gherkinStepLine":22,"keywordType":"Outcome","textWithKeyword":"And I view ExecutionHighlighting{node: \"wait()\"} not in ControlFlowGraph: The unselected path is not highlighted"},{"pwStepLine":15,"gherkinStepLine":23,"keywordType":"Outcome","textWithKeyword":"And I view ExecutionHighlighting{} not in ControlFlowGraph: No node remains highlighted after completion"}]},
]; // bdd-data-end