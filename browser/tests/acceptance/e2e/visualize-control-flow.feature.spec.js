// Generated from: ../features/visualize-control-flow.feature
import { test } from "playwright-bdd";

test.describe('Visualize a control-flow graph', () => {

  test('Connect an empty Procedure directly from Entry to Exit', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "empty.ts", kind: File, status: Ready, source: ""}'); 
    await When('I visualizeControlFlow(procedure: "empty.ts")'); 
    await Then('I view GraphNode{label: Entry, kind: Entry} in ControlFlowGraph: The start boundary is visible'); 
    await And('I view GraphNode{label: Exit, kind: Exit} in ControlFlowGraph: The end boundary is visible'); 
    await And('I view ControlFlowTransition{from: Entry, outcome: "", to: Exit} in ControlFlowGraph: The empty flow is complete'); 
  });

  test.describe('Visualize supported TypeScript file Procedures', () => {

    test('Example #1', async ({ Given, When, Then }) => { 
      await Given('Procedure{name: "work.ts", kind: File, status: Ready, source: "work()"}'); 
      await When('I visualizeControlFlow(procedure: "work.ts")'); 
      await Then('I view GraphNode{label: "work()", kind: Executable} in ControlFlowGraph: Supported TypeScript source is represented'); 
    });

    test('Example #2', async ({ Given, When, Then }) => { 
      await Given('Procedure{name: "view.tsx", kind: File, status: Ready, source: "const view = <Panel />"}'); 
      await When('I visualizeControlFlow(procedure: "view.tsx")'); 
      await Then('I view GraphNode{label: "const view = <Panel />", kind: Executable} in ControlFlowGraph: Supported TypeScript source is represented'); 
    });

  });

  test('Visualize both paths through a branch', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "classify.ts", kind: File, status: Ready, source: "if (ready) { work() } else { wait() }"}'); 
    await When('I visualizeControlFlow(procedure: "classify.ts")'); 
    await Then('I view GraphNode{} in ControlFlowGraph: Every branch node is visible', {"dataTable":{"rows":[{"cells":[{"value":"label"},{"value":"kind"}]},{"cells":[{"value":"Entry"},{"value":"Entry"}]},{"cells":[{"value":"ready"},{"value":"Decision"}]},{"cells":[{"value":"work()"},{"value":"Executable"}]},{"cells":[{"value":"wait()"},{"value":"Executable"}]},{"cells":[{"value":"Exit"},{"value":"Exit"}]}]}}); 
    await And('I view ControlFlowTransition{} in ControlFlowGraph: Both branch outcomes are visible', {"dataTable":{"rows":[{"cells":[{"value":"from"},{"value":"outcome"},{"value":"to"}]},{"cells":[{"value":"Entry"},{"value":""},{"value":"ready"}]},{"cells":[{"value":"ready"},{"value":"true"},{"value":"work()"}]},{"cells":[{"value":"ready"},{"value":"false"},{"value":"wait()"}]},{"cells":[{"value":"work()"},{"value":""},{"value":"Exit"}]},{"cells":[{"value":"wait()"},{"value":""},{"value":"Exit"}]}]}}); 
  });

  test('Identify sequential statements and their source locations', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "calculate", kind: Function, status: Ready, source: "function calculate() {\\n  const value = read()\\n  return value\\n}"}'); 
    await When('I visualizeControlFlow(procedure: "calculate")'); 
    await Then('I view GraphNode{} in ControlFlowGraph: Source text and line ranges identify every node', {"dataTable":{"rows":[{"cells":[{"value":"label"},{"value":"line range"}]},{"cells":[{"value":"Entry"},{"value":"Boundary"}]},{"cells":[{"value":"const value = read()"},{"value":"2-2"}]},{"cells":[{"value":"return value"},{"value":"3-3"}]},{"cells":[{"value":"Exit"},{"value":"Boundary"}]}]}}); 
    await And('I view ControlFlowTransition{from: "return value", outcome: "", to: Exit} in ControlFlowGraph: Return reaches the Procedure boundary'); 
  });

  test('Terminate a Procedure with an uncaught throw', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "fail", kind: Function, status: Ready, source: "function fail(error: Error) { throw error }"}'); 
    await When('I visualizeControlFlow(procedure: "fail")'); 
    await Then('I view GraphNode{label: "throw error", kind: Executable} in ControlFlowGraph: The abrupt statement is visible'); 
    await And('I view ControlFlowTransition{from: "throw error", outcome: "", to: Exit} in ControlFlowGraph: The uncaught throw reaches Exit'); 
  });

  test('Preserve switch alternatives fall-through and break', async ({ Given, When, Then }) => { 
    await Given('Procedure{name: "route.ts", kind: File, status: Ready, source: "switch (kind) { case \'a\': first(); case \'b\': second(); break; default: other() } done()"}'); 
    await When('I visualizeControlFlow(procedure: "route.ts")'); 
    await Then('I view ControlFlowTransition{} in ControlFlowGraph: Cases branch fall through and converge correctly', {"dataTable":{"rows":[{"cells":[{"value":"from"},{"value":"outcome"},{"value":"to"}]},{"cells":[{"value":"kind"},{"value":"case 'a'"},{"value":"first()"}]},{"cells":[{"value":"kind"},{"value":"case 'b'"},{"value":"second()"}]},{"cells":[{"value":"kind"},{"value":"default"},{"value":"other()"}]},{"cells":[{"value":"first()"},{"value":""},{"value":"second()"}]},{"cells":[{"value":"second()"},{"value":""},{"value":"break"}]},{"cells":[{"value":"break"},{"value":""},{"value":"done()"}]},{"cells":[{"value":"other()"},{"value":""},{"value":"done()"}]}]}}); 
  });

  test('Represent a while loop as a cycle', async ({ Given, When, Then }) => { 
    await Given('Procedure{name: "wait.ts", kind: File, status: Ready, source: "while (ready) { work() } after()"}'); 
    await When('I visualizeControlFlow(procedure: "wait.ts")'); 
    await Then('I view ControlFlowTransition{} in ControlFlowGraph: The loop can repeat or exit', {"dataTable":{"rows":[{"cells":[{"value":"from"},{"value":"outcome"},{"value":"to"}]},{"cells":[{"value":"ready"},{"value":"true"},{"value":"work()"}]},{"cells":[{"value":"work()"},{"value":""},{"value":"ready"}]},{"cells":[{"value":"ready"},{"value":"false"},{"value":"after()"}]}]}}); 
  });

  test('Preserve an infinite loop with an empty body as a cycle', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "spin.ts", kind: File, status: Ready, source: "for (;;);"}'); 
    await When('I visualizeControlFlow(procedure: "spin.ts")'); 
    await Then('I view GraphNode{label: ";"} not in ControlFlowGraph: The empty body is omitted'); 
    await And('I view ControlFlowTransition{from: "for (;;)", outcome: repeat, to: "for (;;)"} in ControlFlowGraph: The non-terminating cycle remains visible'); 
    await And('I view ControlFlowTransition{from: "for (;;)", to: Exit} not in ControlFlowGraph: An impossible exit is not invented'); 
  });

  test('Execute a do-while body before its decision', async ({ Given, When, Then }) => { 
    await Given('Procedure{name: "retry.ts", kind: File, status: Ready, source: "do { attempt() } while (retry); finish()"}'); 
    await When('I visualizeControlFlow(procedure: "retry.ts")'); 
    await Then('I view ControlFlowTransition{} in ControlFlowGraph: The body precedes the loop decision', {"dataTable":{"rows":[{"cells":[{"value":"from"},{"value":"outcome"},{"value":"to"}]},{"cells":[{"value":"Entry"},{"value":""},{"value":"attempt()"}]},{"cells":[{"value":"attempt()"},{"value":""},{"value":"retry"}]},{"cells":[{"value":"retry"},{"value":"true"},{"value":"attempt()"}]},{"cells":[{"value":"retry"},{"value":"false"},{"value":"finish()"}]}]}}); 
  });

  test('Continue a for loop through its update', async ({ Given, When, Then }) => { 
    await Given('Procedure{name: "count.ts", kind: File, status: Ready, source: "for (let i = 0; i < 3; i++) { continue } after()"}'); 
    await When('I visualizeControlFlow(procedure: "count.ts")'); 
    await Then('I view ControlFlowTransition{} in ControlFlowGraph: For-loop phases retain their control-flow order', {"dataTable":{"rows":[{"cells":[{"value":"from"},{"value":"outcome"},{"value":"to"}]},{"cells":[{"value":"let i = 0"},{"value":""},{"value":"i < 3"}]},{"cells":[{"value":"i < 3"},{"value":"true"},{"value":"continue"}]},{"cells":[{"value":"continue"},{"value":""},{"value":"i++"}]},{"cells":[{"value":"i++"},{"value":""},{"value":"i < 3"}]},{"cells":[{"value":"i < 3"},{"value":"false"},{"value":"after()"}]}]}}); 
  });

  test.describe('Iterate over collection keys and values', () => {

    test('Example #1', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "iterate.ts", kind: File, status: Ready, source: "for (const item in values) { work(item) } after()"}'); 
      await When('I visualizeControlFlow(procedure: "iterate.ts")'); 
      await Then('I view ControlFlowTransition{from: "values keys", outcome: "next item", to: "work(item)"} in ControlFlowGraph: The body can receive an item'); 
      await And('I view ControlFlowTransition{from: "work(item)", outcome: "", to: "values keys"} in ControlFlowGraph: Iteration returns for the next item'); 
      await And('I view ControlFlowTransition{from: "values keys", outcome: "iteration end", to: "after()"} in ControlFlowGraph: Iteration can finish without entering the body'); 
    });

    test('Example #2', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "iterate.ts", kind: File, status: Ready, source: "for (const item of values) { work(item) } after()"}'); 
      await When('I visualizeControlFlow(procedure: "iterate.ts")'); 
      await Then('I view ControlFlowTransition{from: "values items", outcome: "next item", to: "work(item)"} in ControlFlowGraph: The body can receive an item'); 
      await And('I view ControlFlowTransition{from: "work(item)", outcome: "", to: "values items"} in ControlFlowGraph: Iteration returns for the next item'); 
      await And('I view ControlFlowTransition{from: "values items", outcome: "iteration end", to: "after()"} in ControlFlowGraph: Iteration can finish without entering the body'); 
    });

  });

  test.describe('Continue through a condition-controlled loop', () => {

    test('Example #1', async ({ Given, When, Then }) => { 
      await Given('Procedure{name: "continue.ts", kind: File, status: Ready, source: "while (ready) { continue } after()"}'); 
      await When('I visualizeControlFlow(procedure: "continue.ts")'); 
      await Then('I view ControlFlowTransition{from: continue, outcome: "", to: ready} in ControlFlowGraph: Continue returns to the loop condition'); 
    });

    test('Example #2', async ({ Given, When, Then }) => { 
      await Given('Procedure{name: "continue.ts", kind: File, status: Ready, source: "do { continue } while (ready)"}'); 
      await When('I visualizeControlFlow(procedure: "continue.ts")'); 
      await Then('I view ControlFlowTransition{from: continue, outcome: "", to: ready} in ControlFlowGraph: Continue returns to the loop condition'); 
    });

  });

  test('Resolve a labeled break without showing a label node', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "labeled.ts", kind: File, status: Ready, source: "outer: while (ready) { break outer } done()"}'); 
    await When('I visualizeControlFlow(procedure: "labeled.ts")'); 
    await Then('I view GraphNode{label: outer} not in ControlFlowGraph: The Label remains jump metadata'); 
    await And('I view ControlFlowTransition{from: "break outer", outcome: "", to: "done()"} in ControlFlowGraph: The labeled jump reaches its destination'); 
  });

  test('Route normal and exceptional paths through finally', async ({ Given, When, Then }) => { 
    await Given('Procedure{name: "recover", kind: Function, status: Ready, source: "function recover(failed: boolean, error: Error) { try { if (failed) throw error; work() } catch { recoverWork() } finally { cleanup() } }"}'); 
    await When('I visualizeControlFlow(procedure: "recover")'); 
    await Then('I view ControlFlowTransition{} in ControlFlowGraph: Explicit exception and normal paths traverse finally', {"dataTable":{"rows":[{"cells":[{"value":"from"},{"value":"outcome"},{"value":"to"}]},{"cells":[{"value":"failed"},{"value":"true"},{"value":"throw error"}]},{"cells":[{"value":"throw error"},{"value":""},{"value":"recoverWork()"}]},{"cells":[{"value":"failed"},{"value":"false"},{"value":"work()"}]},{"cells":[{"value":"recoverWork()"},{"value":""},{"value":"cleanup()"}]},{"cells":[{"value":"work()"},{"value":""},{"value":"cleanup()"}]},{"cells":[{"value":"cleanup()"},{"value":""},{"value":"Exit"}]}]}}); 
  });

  test.describe('Traverse finally before an abrupt destination', () => {

    test('Example #1', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "finish", kind: Function, status: Ready, source: "function finish(result: number) { try { return result } finally { cleanup() } }"}'); 
      await When('I visualizeControlFlow(procedure: "finish")'); 
      await Then('I view ControlFlowTransition{from: "return result", outcome: "", to: "cleanup()"} in ControlFlowGraph: Finally intercepts the abrupt path'); 
      await And('I view ControlFlowTransition{from: "cleanup()", outcome: "", to: Exit} in ControlFlowGraph: The abrupt path resumes after finally'); 
    });

    test('Example #2', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "break.ts", kind: File, status: Ready, source: "while (ready) { try { break } finally { cleanup() } } after()"}'); 
      await When('I visualizeControlFlow(procedure: "break.ts")'); 
      await Then('I view ControlFlowTransition{from: break, outcome: "", to: "cleanup()"} in ControlFlowGraph: Finally intercepts the abrupt path'); 
      await And('I view ControlFlowTransition{from: "cleanup()", outcome: "", to: "after()"} in ControlFlowGraph: The abrupt path resumes after finally'); 
    });

    test('Example #3', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "update.ts", kind: File, status: Ready, source: "for (let i = 0; i < 3; i++) { try { continue } finally { cleanup() } }"}'); 
      await When('I visualizeControlFlow(procedure: "update.ts")'); 
      await Then('I view ControlFlowTransition{from: continue, outcome: "", to: "cleanup()"} in ControlFlowGraph: Finally intercepts the abrupt path'); 
      await And('I view ControlFlowTransition{from: "cleanup()", outcome: "", to: "i++"} in ControlFlowGraph: The abrupt path resumes after finally'); 
    });

    test('Example #4', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "fail", kind: Function, status: Ready, source: "function fail(error: Error) { try { throw error } finally { cleanup() } }"}'); 
      await When('I visualizeControlFlow(procedure: "fail")'); 
      await Then('I view ControlFlowTransition{from: "throw error", outcome: "", to: "cleanup()"} in ControlFlowGraph: Finally intercepts the abrupt path'); 
      await And('I view ControlFlowTransition{from: "cleanup()", outcome: "", to: Exit} in ControlFlowGraph: The abrupt path resumes after finally'); 
    });

  });

  test('Omit an empty statement while retaining runtime-visible statements', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "flow", kind: Function, status: Ready, source: "function* flow(first: unknown, rest: Iterable<unknown>) { ; debugger; yield first; yield* rest }"}'); 
    await When('I visualizeControlFlow(procedure: "flow")'); 
    await Then('I view GraphNode{label: ";"} not in ControlFlowGraph: The empty statement is omitted'); 
    await And('I view GraphNode{} in ControlFlowGraph: Runtime-visible statements remain visible', {"dataTable":{"rows":[{"cells":[{"value":"label"}]},{"cells":[{"value":"debugger"}]},{"cells":[{"value":"yield first"}]},{"cells":[{"value":"yield* rest"}]}]}}); 
  });

  test('Show an await suspension point', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "load", kind: Function, status: Ready, source: "async function load(task: Promise<void>) { await task; finish() }"}'); 
    await When('I visualizeControlFlow(procedure: "load")'); 
    await Then('I view GraphNode{label: "await task", kind: Executable} in ControlFlowGraph: The suspension point is visible'); 
    await And('I view ControlFlowTransition{from: "await task", outcome: "", to: "finish()"} in ControlFlowGraph: The possible flow continues sequentially'); 
  });

  test.describe('Expose control flow inside expressions', () => {

    test('Example #1', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "expression.ts", kind: File, status: Ready, source: "ready && work()"}'); 
      await When('I visualizeControlFlow(procedure: "expression.ts")'); 
      await Then('I view GraphNode{label: "ready", kind: Decision} in ControlFlowGraph: The expression decision is visible'); 
      await And('I view ControlFlowTransition{from: "ready", outcome: truthy, to: "work()"} in ControlFlowGraph: The conditional evaluation path is visible'); 
      await And('I view ControlFlowTransition{from: "ready", outcome: falsy, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible'); 
    });

    test('Example #2', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "expression.ts", kind: File, status: Ready, source: "ready || fallback()"}'); 
      await When('I visualizeControlFlow(procedure: "expression.ts")'); 
      await Then('I view GraphNode{label: "ready", kind: Decision} in ControlFlowGraph: The expression decision is visible'); 
      await And('I view ControlFlowTransition{from: "ready", outcome: falsy, to: "fallback()"} in ControlFlowGraph: The conditional evaluation path is visible'); 
      await And('I view ControlFlowTransition{from: "ready", outcome: truthy, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible'); 
    });

    test('Example #3', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "expression.ts", kind: File, status: Ready, source: "value ?? fallback()"}'); 
      await When('I visualizeControlFlow(procedure: "expression.ts")'); 
      await Then('I view GraphNode{label: "value", kind: Decision} in ControlFlowGraph: The expression decision is visible'); 
      await And('I view ControlFlowTransition{from: "value", outcome: nullish, to: "fallback()"} in ControlFlowGraph: The conditional evaluation path is visible'); 
      await And('I view ControlFlowTransition{from: "value", outcome: not-nullish, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible'); 
    });

    test('Example #4', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "expression.ts", kind: File, status: Ready, source: "condition ? left() : right()"}'); 
      await When('I visualizeControlFlow(procedure: "expression.ts")'); 
      await Then('I view GraphNode{label: "condition", kind: Decision} in ControlFlowGraph: The expression decision is visible'); 
      await And('I view ControlFlowTransition{from: "condition", outcome: true, to: "left()"} in ControlFlowGraph: The conditional evaluation path is visible'); 
      await And('I view ControlFlowTransition{from: "condition", outcome: false, to: "right()"} in ControlFlowGraph: The alternate evaluation path is visible'); 
    });

    test('Example #5', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "expression.ts", kind: File, status: Ready, source: "ready &&= work()"}'); 
      await When('I visualizeControlFlow(procedure: "expression.ts")'); 
      await Then('I view GraphNode{label: "ready", kind: Decision} in ControlFlowGraph: The expression decision is visible'); 
      await And('I view ControlFlowTransition{from: "ready", outcome: truthy, to: "work()"} in ControlFlowGraph: The conditional evaluation path is visible'); 
      await And('I view ControlFlowTransition{from: "ready", outcome: falsy, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible'); 
    });

    test('Example #6', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "expression.ts", kind: File, status: Ready, source: "ready ||= fallback()"}'); 
      await When('I visualizeControlFlow(procedure: "expression.ts")'); 
      await Then('I view GraphNode{label: "ready", kind: Decision} in ControlFlowGraph: The expression decision is visible'); 
      await And('I view ControlFlowTransition{from: "ready", outcome: falsy, to: "fallback()"} in ControlFlowGraph: The conditional evaluation path is visible'); 
      await And('I view ControlFlowTransition{from: "ready", outcome: truthy, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible'); 
    });

    test('Example #7', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "expression.ts", kind: File, status: Ready, source: "value ??= fallback()"}'); 
      await When('I visualizeControlFlow(procedure: "expression.ts")'); 
      await Then('I view GraphNode{label: "value", kind: Decision} in ControlFlowGraph: The expression decision is visible'); 
      await And('I view ControlFlowTransition{from: "value", outcome: nullish, to: "fallback()"} in ControlFlowGraph: The conditional evaluation path is visible'); 
      await And('I view ControlFlowTransition{from: "value", outcome: not-nullish, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible'); 
    });

    test('Example #8', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "expression.ts", kind: File, status: Ready, source: "callback?.()"}'); 
      await When('I visualizeControlFlow(procedure: "expression.ts")'); 
      await Then('I view GraphNode{label: "callback", kind: Decision} in ControlFlowGraph: The expression decision is visible'); 
      await And('I view ControlFlowTransition{from: "callback", outcome: not-nullish, to: "callback()"} in ControlFlowGraph: The conditional evaluation path is visible'); 
      await And('I view ControlFlowTransition{from: "callback", outcome: nullish, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible'); 
    });

    test('Example #9', async ({ Given, When, Then, And }) => { 
      await Given('Procedure{name: "expression.ts", kind: File, status: Ready, source: "user?.profile"}'); 
      await When('I visualizeControlFlow(procedure: "expression.ts")'); 
      await Then('I view GraphNode{label: "user", kind: Decision} in ControlFlowGraph: The expression decision is visible'); 
      await And('I view ControlFlowTransition{from: "user", outcome: not-nullish, to: "user.profile"} in ControlFlowGraph: The conditional evaluation path is visible'); 
      await And('I view ControlFlowTransition{from: "user", outcome: nullish, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible'); 
    });

  });

  test('Keep nested Procedures outside a file graph', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "helpers.ts", kind: File, status: Ready, source: "import type { JobSpec } from \'./types\'; interface Job {} type JobId = string; const helper = () => work(); helper()"}'); 
    await When('I visualizeControlFlow(procedure: "helpers.ts")'); 
    await Then('I view GraphNode{label: "helper()", kind: Executable} in ControlFlowGraph: The call is represented once'); 
    await And('I view GraphNode{label: "work()"} not in ControlFlowGraph: The arrow-function body remains a separate Procedure'); 
    await And('I view GraphNode{label: "interface Job {}"} not in ControlFlowGraph: Erased interface syntax is omitted'); 
    await And('I view GraphNode{label: "type JobId = string"} not in ControlFlowGraph: Erased type syntax is omitted'); 
    await And('I view GraphNode{label: "import type { JobSpec } from \'./types\'"} not in ControlFlowGraph: Erased type-only imports are omitted'); 
  });

  test('Show executable class initialization without a bare class node', async ({ Given, When, Then, And }) => { 
    await Given('Procedure{name: "worker.ts", kind: File, status: Ready, source: "class Worker extends makeBase() { static [key ?? fallback()] = initialize(); static ready; static { register() } declare static typeOnly: string; run() { work() } }"}'); 
    await When('I visualizeControlFlow(procedure: "worker.ts")'); 
    await Then('I view GraphNode{label: "class Worker"} not in ControlFlowGraph: The bare declaration is omitted'); 
    await And('I view GraphNode{} in ControlFlowGraph: Runtime class initialization is visible', {"dataTable":{"rows":[{"cells":[{"value":"label"},{"value":"kind"}]},{"cells":[{"value":"makeBase()"},{"value":"Executable"}]},{"cells":[{"value":"key"},{"value":"Decision"}]},{"cells":[{"value":"fallback()"},{"value":"Executable"}]},{"cells":[{"value":"static [key ?? fallback()] = initialize()"},{"value":"Executable"}]},{"cells":[{"value":"static ready"},{"value":"Executable"}]},{"cells":[{"value":"register()"},{"value":"Executable"}]}]}}); 
    await And('I view GraphNode{label: "declare static typeOnly: string"} not in ControlFlowGraph: Erased static syntax is omitted'); 
    await And('I view GraphNode{label: "work()"} not in ControlFlowGraph: The method body remains a separate Procedure'); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('../features/visualize-control-flow.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":7,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":8,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"empty.ts\", kind: File, status: Ready, source: \"\"}"},{"pwStepLine":8,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"empty.ts\")"},{"pwStepLine":9,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: Entry, kind: Entry} in ControlFlowGraph: The start boundary is visible"},{"pwStepLine":10,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: Exit, kind: Exit} in ControlFlowGraph: The end boundary is visible"},{"pwStepLine":11,"gherkinStepLine":12,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: Entry, outcome: \"\", to: Exit} in ControlFlowGraph: The empty flow is complete"}]},
  {"pwTestLine":16,"pickleLine":21,"tags":[],"steps":[{"pwStepLine":17,"gherkinStepLine":15,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"work.ts\", kind: File, status: Ready, source: \"work()\"}"},{"pwStepLine":18,"gherkinStepLine":16,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"work.ts\")"},{"pwStepLine":19,"gherkinStepLine":17,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"work()\", kind: Executable} in ControlFlowGraph: Supported TypeScript source is represented"}]},
  {"pwTestLine":22,"pickleLine":22,"tags":[],"steps":[{"pwStepLine":23,"gherkinStepLine":15,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"view.tsx\", kind: File, status: Ready, source: \"const view = <Panel />\"}"},{"pwStepLine":24,"gherkinStepLine":16,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"view.tsx\")"},{"pwStepLine":25,"gherkinStepLine":17,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"const view = <Panel />\", kind: Executable} in ControlFlowGraph: Supported TypeScript source is represented"}]},
  {"pwTestLine":30,"pickleLine":24,"tags":[],"steps":[{"pwStepLine":31,"gherkinStepLine":25,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"classify.ts\", kind: File, status: Ready, source: \"if (ready) { work() } else { wait() }\"}"},{"pwStepLine":32,"gherkinStepLine":26,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"classify.ts\")"},{"pwStepLine":33,"gherkinStepLine":27,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{} in ControlFlowGraph: Every branch node is visible"},{"pwStepLine":34,"gherkinStepLine":34,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{} in ControlFlowGraph: Both branch outcomes are visible"}]},
  {"pwTestLine":37,"pickleLine":42,"tags":[],"steps":[{"pwStepLine":38,"gherkinStepLine":43,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"calculate\", kind: Function, status: Ready, source: \"function calculate() {\\n  const value = read()\\n  return value\\n}\"}"},{"pwStepLine":39,"gherkinStepLine":44,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"calculate\")"},{"pwStepLine":40,"gherkinStepLine":45,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{} in ControlFlowGraph: Source text and line ranges identify every node"},{"pwStepLine":41,"gherkinStepLine":51,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"return value\", outcome: \"\", to: Exit} in ControlFlowGraph: Return reaches the Procedure boundary"}]},
  {"pwTestLine":44,"pickleLine":53,"tags":[],"steps":[{"pwStepLine":45,"gherkinStepLine":54,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"fail\", kind: Function, status: Ready, source: \"function fail(error: Error) { throw error }\"}"},{"pwStepLine":46,"gherkinStepLine":55,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"fail\")"},{"pwStepLine":47,"gherkinStepLine":56,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"throw error\", kind: Executable} in ControlFlowGraph: The abrupt statement is visible"},{"pwStepLine":48,"gherkinStepLine":57,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"throw error\", outcome: \"\", to: Exit} in ControlFlowGraph: The uncaught throw reaches Exit"}]},
  {"pwTestLine":51,"pickleLine":59,"tags":[],"steps":[{"pwStepLine":52,"gherkinStepLine":60,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"route.ts\", kind: File, status: Ready, source: \"switch (kind) { case 'a': first(); case 'b': second(); break; default: other() } done()\"}"},{"pwStepLine":53,"gherkinStepLine":61,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"route.ts\")"},{"pwStepLine":54,"gherkinStepLine":62,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{} in ControlFlowGraph: Cases branch fall through and converge correctly"}]},
  {"pwTestLine":57,"pickleLine":72,"tags":[],"steps":[{"pwStepLine":58,"gherkinStepLine":73,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"wait.ts\", kind: File, status: Ready, source: \"while (ready) { work() } after()\"}"},{"pwStepLine":59,"gherkinStepLine":74,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"wait.ts\")"},{"pwStepLine":60,"gherkinStepLine":75,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{} in ControlFlowGraph: The loop can repeat or exit"}]},
  {"pwTestLine":63,"pickleLine":81,"tags":[],"steps":[{"pwStepLine":64,"gherkinStepLine":82,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"spin.ts\", kind: File, status: Ready, source: \"for (;;);\"}"},{"pwStepLine":65,"gherkinStepLine":83,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"spin.ts\")"},{"pwStepLine":66,"gherkinStepLine":84,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \";\"} not in ControlFlowGraph: The empty body is omitted"},{"pwStepLine":67,"gherkinStepLine":85,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"for (;;)\", outcome: repeat, to: \"for (;;)\"} in ControlFlowGraph: The non-terminating cycle remains visible"},{"pwStepLine":68,"gherkinStepLine":86,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"for (;;)\", to: Exit} not in ControlFlowGraph: An impossible exit is not invented"}]},
  {"pwTestLine":71,"pickleLine":88,"tags":[],"steps":[{"pwStepLine":72,"gherkinStepLine":89,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"retry.ts\", kind: File, status: Ready, source: \"do { attempt() } while (retry); finish()\"}"},{"pwStepLine":73,"gherkinStepLine":90,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"retry.ts\")"},{"pwStepLine":74,"gherkinStepLine":91,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{} in ControlFlowGraph: The body precedes the loop decision"}]},
  {"pwTestLine":77,"pickleLine":98,"tags":[],"steps":[{"pwStepLine":78,"gherkinStepLine":99,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"count.ts\", kind: File, status: Ready, source: \"for (let i = 0; i < 3; i++) { continue } after()\"}"},{"pwStepLine":79,"gherkinStepLine":100,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"count.ts\")"},{"pwStepLine":80,"gherkinStepLine":101,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{} in ControlFlowGraph: For-loop phases retain their control-flow order"}]},
  {"pwTestLine":85,"pickleLine":118,"tags":[],"steps":[{"pwStepLine":86,"gherkinStepLine":110,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"iterate.ts\", kind: File, status: Ready, source: \"for (const item in values) { work(item) } after()\"}"},{"pwStepLine":87,"gherkinStepLine":111,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"iterate.ts\")"},{"pwStepLine":88,"gherkinStepLine":112,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{from: \"values keys\", outcome: \"next item\", to: \"work(item)\"} in ControlFlowGraph: The body can receive an item"},{"pwStepLine":89,"gherkinStepLine":113,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"work(item)\", outcome: \"\", to: \"values keys\"} in ControlFlowGraph: Iteration returns for the next item"},{"pwStepLine":90,"gherkinStepLine":114,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"values keys\", outcome: \"iteration end\", to: \"after()\"} in ControlFlowGraph: Iteration can finish without entering the body"}]},
  {"pwTestLine":93,"pickleLine":119,"tags":[],"steps":[{"pwStepLine":94,"gherkinStepLine":110,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"iterate.ts\", kind: File, status: Ready, source: \"for (const item of values) { work(item) } after()\"}"},{"pwStepLine":95,"gherkinStepLine":111,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"iterate.ts\")"},{"pwStepLine":96,"gherkinStepLine":112,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{from: \"values items\", outcome: \"next item\", to: \"work(item)\"} in ControlFlowGraph: The body can receive an item"},{"pwStepLine":97,"gherkinStepLine":113,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"work(item)\", outcome: \"\", to: \"values items\"} in ControlFlowGraph: Iteration returns for the next item"},{"pwStepLine":98,"gherkinStepLine":114,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"values items\", outcome: \"iteration end\", to: \"after()\"} in ControlFlowGraph: Iteration can finish without entering the body"}]},
  {"pwTestLine":105,"pickleLine":128,"tags":[],"steps":[{"pwStepLine":106,"gherkinStepLine":122,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"continue.ts\", kind: File, status: Ready, source: \"while (ready) { continue } after()\"}"},{"pwStepLine":107,"gherkinStepLine":123,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"continue.ts\")"},{"pwStepLine":108,"gherkinStepLine":124,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{from: continue, outcome: \"\", to: ready} in ControlFlowGraph: Continue returns to the loop condition"}]},
  {"pwTestLine":111,"pickleLine":129,"tags":[],"steps":[{"pwStepLine":112,"gherkinStepLine":122,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"continue.ts\", kind: File, status: Ready, source: \"do { continue } while (ready)\"}"},{"pwStepLine":113,"gherkinStepLine":123,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"continue.ts\")"},{"pwStepLine":114,"gherkinStepLine":124,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{from: continue, outcome: \"\", to: ready} in ControlFlowGraph: Continue returns to the loop condition"}]},
  {"pwTestLine":119,"pickleLine":131,"tags":[],"steps":[{"pwStepLine":120,"gherkinStepLine":132,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"labeled.ts\", kind: File, status: Ready, source: \"outer: while (ready) { break outer } done()\"}"},{"pwStepLine":121,"gherkinStepLine":133,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"labeled.ts\")"},{"pwStepLine":122,"gherkinStepLine":134,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: outer} not in ControlFlowGraph: The Label remains jump metadata"},{"pwStepLine":123,"gherkinStepLine":135,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"break outer\", outcome: \"\", to: \"done()\"} in ControlFlowGraph: The labeled jump reaches its destination"}]},
  {"pwTestLine":126,"pickleLine":137,"tags":[],"steps":[{"pwStepLine":127,"gherkinStepLine":138,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"recover\", kind: Function, status: Ready, source: \"function recover(failed: boolean, error: Error) { try { if (failed) throw error; work() } catch { recoverWork() } finally { cleanup() } }\"}"},{"pwStepLine":128,"gherkinStepLine":139,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"recover\")"},{"pwStepLine":129,"gherkinStepLine":140,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{} in ControlFlowGraph: Explicit exception and normal paths traverse finally"}]},
  {"pwTestLine":134,"pickleLine":157,"tags":[],"steps":[{"pwStepLine":135,"gherkinStepLine":150,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"finish\", kind: Function, status: Ready, source: \"function finish(result: number) { try { return result } finally { cleanup() } }\"}"},{"pwStepLine":136,"gherkinStepLine":151,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"finish\")"},{"pwStepLine":137,"gherkinStepLine":152,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{from: \"return result\", outcome: \"\", to: \"cleanup()\"} in ControlFlowGraph: Finally intercepts the abrupt path"},{"pwStepLine":138,"gherkinStepLine":153,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"cleanup()\", outcome: \"\", to: Exit} in ControlFlowGraph: The abrupt path resumes after finally"}]},
  {"pwTestLine":141,"pickleLine":158,"tags":[],"steps":[{"pwStepLine":142,"gherkinStepLine":150,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"break.ts\", kind: File, status: Ready, source: \"while (ready) { try { break } finally { cleanup() } } after()\"}"},{"pwStepLine":143,"gherkinStepLine":151,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"break.ts\")"},{"pwStepLine":144,"gherkinStepLine":152,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{from: break, outcome: \"\", to: \"cleanup()\"} in ControlFlowGraph: Finally intercepts the abrupt path"},{"pwStepLine":145,"gherkinStepLine":153,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"cleanup()\", outcome: \"\", to: \"after()\"} in ControlFlowGraph: The abrupt path resumes after finally"}]},
  {"pwTestLine":148,"pickleLine":159,"tags":[],"steps":[{"pwStepLine":149,"gherkinStepLine":150,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"update.ts\", kind: File, status: Ready, source: \"for (let i = 0; i < 3; i++) { try { continue } finally { cleanup() } }\"}"},{"pwStepLine":150,"gherkinStepLine":151,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"update.ts\")"},{"pwStepLine":151,"gherkinStepLine":152,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{from: continue, outcome: \"\", to: \"cleanup()\"} in ControlFlowGraph: Finally intercepts the abrupt path"},{"pwStepLine":152,"gherkinStepLine":153,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"cleanup()\", outcome: \"\", to: \"i++\"} in ControlFlowGraph: The abrupt path resumes after finally"}]},
  {"pwTestLine":155,"pickleLine":160,"tags":[],"steps":[{"pwStepLine":156,"gherkinStepLine":150,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"fail\", kind: Function, status: Ready, source: \"function fail(error: Error) { try { throw error } finally { cleanup() } }\"}"},{"pwStepLine":157,"gherkinStepLine":151,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"fail\")"},{"pwStepLine":158,"gherkinStepLine":152,"keywordType":"Outcome","textWithKeyword":"Then I view ControlFlowTransition{from: \"throw error\", outcome: \"\", to: \"cleanup()\"} in ControlFlowGraph: Finally intercepts the abrupt path"},{"pwStepLine":159,"gherkinStepLine":153,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"cleanup()\", outcome: \"\", to: Exit} in ControlFlowGraph: The abrupt path resumes after finally"}]},
  {"pwTestLine":164,"pickleLine":162,"tags":[],"steps":[{"pwStepLine":165,"gherkinStepLine":163,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"flow\", kind: Function, status: Ready, source: \"function* flow(first: unknown, rest: Iterable<unknown>) { ; debugger; yield first; yield* rest }\"}"},{"pwStepLine":166,"gherkinStepLine":164,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"flow\")"},{"pwStepLine":167,"gherkinStepLine":165,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \";\"} not in ControlFlowGraph: The empty statement is omitted"},{"pwStepLine":168,"gherkinStepLine":166,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{} in ControlFlowGraph: Runtime-visible statements remain visible"}]},
  {"pwTestLine":171,"pickleLine":172,"tags":[],"steps":[{"pwStepLine":172,"gherkinStepLine":173,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"load\", kind: Function, status: Ready, source: \"async function load(task: Promise<void>) { await task; finish() }\"}"},{"pwStepLine":173,"gherkinStepLine":174,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"load\")"},{"pwStepLine":174,"gherkinStepLine":175,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"await task\", kind: Executable} in ControlFlowGraph: The suspension point is visible"},{"pwStepLine":175,"gherkinStepLine":176,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"await task\", outcome: \"\", to: \"finish()\"} in ControlFlowGraph: The possible flow continues sequentially"}]},
  {"pwTestLine":180,"pickleLine":187,"tags":[],"steps":[{"pwStepLine":181,"gherkinStepLine":179,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"expression.ts\", kind: File, status: Ready, source: \"ready && work()\"}"},{"pwStepLine":182,"gherkinStepLine":180,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"expression.ts\")"},{"pwStepLine":183,"gherkinStepLine":181,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"ready\", kind: Decision} in ControlFlowGraph: The expression decision is visible"},{"pwStepLine":184,"gherkinStepLine":182,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"ready\", outcome: truthy, to: \"work()\"} in ControlFlowGraph: The conditional evaluation path is visible"},{"pwStepLine":185,"gherkinStepLine":183,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"ready\", outcome: falsy, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible"}]},
  {"pwTestLine":188,"pickleLine":188,"tags":[],"steps":[{"pwStepLine":189,"gherkinStepLine":179,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"expression.ts\", kind: File, status: Ready, source: \"ready || fallback()\"}"},{"pwStepLine":190,"gherkinStepLine":180,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"expression.ts\")"},{"pwStepLine":191,"gherkinStepLine":181,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"ready\", kind: Decision} in ControlFlowGraph: The expression decision is visible"},{"pwStepLine":192,"gherkinStepLine":182,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"ready\", outcome: falsy, to: \"fallback()\"} in ControlFlowGraph: The conditional evaluation path is visible"},{"pwStepLine":193,"gherkinStepLine":183,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"ready\", outcome: truthy, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible"}]},
  {"pwTestLine":196,"pickleLine":189,"tags":[],"steps":[{"pwStepLine":197,"gherkinStepLine":179,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"expression.ts\", kind: File, status: Ready, source: \"value ?? fallback()\"}"},{"pwStepLine":198,"gherkinStepLine":180,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"expression.ts\")"},{"pwStepLine":199,"gherkinStepLine":181,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"value\", kind: Decision} in ControlFlowGraph: The expression decision is visible"},{"pwStepLine":200,"gherkinStepLine":182,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"value\", outcome: nullish, to: \"fallback()\"} in ControlFlowGraph: The conditional evaluation path is visible"},{"pwStepLine":201,"gherkinStepLine":183,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"value\", outcome: not-nullish, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible"}]},
  {"pwTestLine":204,"pickleLine":190,"tags":[],"steps":[{"pwStepLine":205,"gherkinStepLine":179,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"expression.ts\", kind: File, status: Ready, source: \"condition ? left() : right()\"}"},{"pwStepLine":206,"gherkinStepLine":180,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"expression.ts\")"},{"pwStepLine":207,"gherkinStepLine":181,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"condition\", kind: Decision} in ControlFlowGraph: The expression decision is visible"},{"pwStepLine":208,"gherkinStepLine":182,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"condition\", outcome: true, to: \"left()\"} in ControlFlowGraph: The conditional evaluation path is visible"},{"pwStepLine":209,"gherkinStepLine":183,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"condition\", outcome: false, to: \"right()\"} in ControlFlowGraph: The alternate evaluation path is visible"}]},
  {"pwTestLine":212,"pickleLine":191,"tags":[],"steps":[{"pwStepLine":213,"gherkinStepLine":179,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"expression.ts\", kind: File, status: Ready, source: \"ready &&= work()\"}"},{"pwStepLine":214,"gherkinStepLine":180,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"expression.ts\")"},{"pwStepLine":215,"gherkinStepLine":181,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"ready\", kind: Decision} in ControlFlowGraph: The expression decision is visible"},{"pwStepLine":216,"gherkinStepLine":182,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"ready\", outcome: truthy, to: \"work()\"} in ControlFlowGraph: The conditional evaluation path is visible"},{"pwStepLine":217,"gherkinStepLine":183,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"ready\", outcome: falsy, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible"}]},
  {"pwTestLine":220,"pickleLine":192,"tags":[],"steps":[{"pwStepLine":221,"gherkinStepLine":179,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"expression.ts\", kind: File, status: Ready, source: \"ready ||= fallback()\"}"},{"pwStepLine":222,"gherkinStepLine":180,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"expression.ts\")"},{"pwStepLine":223,"gherkinStepLine":181,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"ready\", kind: Decision} in ControlFlowGraph: The expression decision is visible"},{"pwStepLine":224,"gherkinStepLine":182,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"ready\", outcome: falsy, to: \"fallback()\"} in ControlFlowGraph: The conditional evaluation path is visible"},{"pwStepLine":225,"gherkinStepLine":183,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"ready\", outcome: truthy, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible"}]},
  {"pwTestLine":228,"pickleLine":193,"tags":[],"steps":[{"pwStepLine":229,"gherkinStepLine":179,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"expression.ts\", kind: File, status: Ready, source: \"value ??= fallback()\"}"},{"pwStepLine":230,"gherkinStepLine":180,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"expression.ts\")"},{"pwStepLine":231,"gherkinStepLine":181,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"value\", kind: Decision} in ControlFlowGraph: The expression decision is visible"},{"pwStepLine":232,"gherkinStepLine":182,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"value\", outcome: nullish, to: \"fallback()\"} in ControlFlowGraph: The conditional evaluation path is visible"},{"pwStepLine":233,"gherkinStepLine":183,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"value\", outcome: not-nullish, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible"}]},
  {"pwTestLine":236,"pickleLine":194,"tags":[],"steps":[{"pwStepLine":237,"gherkinStepLine":179,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"expression.ts\", kind: File, status: Ready, source: \"callback?.()\"}"},{"pwStepLine":238,"gherkinStepLine":180,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"expression.ts\")"},{"pwStepLine":239,"gherkinStepLine":181,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"callback\", kind: Decision} in ControlFlowGraph: The expression decision is visible"},{"pwStepLine":240,"gherkinStepLine":182,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"callback\", outcome: not-nullish, to: \"callback()\"} in ControlFlowGraph: The conditional evaluation path is visible"},{"pwStepLine":241,"gherkinStepLine":183,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"callback\", outcome: nullish, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible"}]},
  {"pwTestLine":244,"pickleLine":195,"tags":[],"steps":[{"pwStepLine":245,"gherkinStepLine":179,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"expression.ts\", kind: File, status: Ready, source: \"user?.profile\"}"},{"pwStepLine":246,"gherkinStepLine":180,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"expression.ts\")"},{"pwStepLine":247,"gherkinStepLine":181,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"user\", kind: Decision} in ControlFlowGraph: The expression decision is visible"},{"pwStepLine":248,"gherkinStepLine":182,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"user\", outcome: not-nullish, to: \"user.profile\"} in ControlFlowGraph: The conditional evaluation path is visible"},{"pwStepLine":249,"gherkinStepLine":183,"keywordType":"Outcome","textWithKeyword":"And I view ControlFlowTransition{from: \"user\", outcome: nullish, to: Exit} in ControlFlowGraph: The alternate evaluation path is visible"}]},
  {"pwTestLine":254,"pickleLine":197,"tags":[],"steps":[{"pwStepLine":255,"gherkinStepLine":198,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"helpers.ts\", kind: File, status: Ready, source: \"import type { JobSpec } from './types'; interface Job {} type JobId = string; const helper = () => work(); helper()\"}"},{"pwStepLine":256,"gherkinStepLine":199,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"helpers.ts\")"},{"pwStepLine":257,"gherkinStepLine":200,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"helper()\", kind: Executable} in ControlFlowGraph: The call is represented once"},{"pwStepLine":258,"gherkinStepLine":201,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: \"work()\"} not in ControlFlowGraph: The arrow-function body remains a separate Procedure"},{"pwStepLine":259,"gherkinStepLine":202,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: \"interface Job {}\"} not in ControlFlowGraph: Erased interface syntax is omitted"},{"pwStepLine":260,"gherkinStepLine":203,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: \"type JobId = string\"} not in ControlFlowGraph: Erased type syntax is omitted"},{"pwStepLine":261,"gherkinStepLine":204,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: \"import type { JobSpec } from './types'\"} not in ControlFlowGraph: Erased type-only imports are omitted"}]},
  {"pwTestLine":264,"pickleLine":206,"tags":[],"steps":[{"pwStepLine":265,"gherkinStepLine":207,"keywordType":"Context","textWithKeyword":"Given Procedure{name: \"worker.ts\", kind: File, status: Ready, source: \"class Worker extends makeBase() { static [key ?? fallback()] = initialize(); static ready; static { register() } declare static typeOnly: string; run() { work() } }\"}"},{"pwStepLine":266,"gherkinStepLine":208,"keywordType":"Action","textWithKeyword":"When I visualizeControlFlow(procedure: \"worker.ts\")"},{"pwStepLine":267,"gherkinStepLine":209,"keywordType":"Outcome","textWithKeyword":"Then I view GraphNode{label: \"class Worker\"} not in ControlFlowGraph: The bare declaration is omitted"},{"pwStepLine":268,"gherkinStepLine":210,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{} in ControlFlowGraph: Runtime class initialization is visible"},{"pwStepLine":269,"gherkinStepLine":218,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: \"declare static typeOnly: string\"} not in ControlFlowGraph: Erased static syntax is omitted"},{"pwStepLine":270,"gherkinStepLine":219,"keywordType":"Outcome","textWithKeyword":"And I view GraphNode{label: \"work()\"} not in ControlFlowGraph: The method body remains a separate Procedure"}]},
]; // bdd-data-end