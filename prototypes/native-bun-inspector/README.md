# Native Bun inspector feasibility (no source rewriting)

This throwaway experiment tests whether Bun's WebKit Inspector can observe CFG visits without a preload transform. It does **not** run or alter Local Agent Factory and is not an integration.

## Result: the tested candidate fails the current contract

On Bun `1.3.14+0d9b296af`, Inspector protocol `Debugger.getBreakpointLocations` returned source locations; `Debugger.setBreakpoint` accepted `BreakpointOptions { autoContinue: true, actions: [{ type: "probe", ... }] }`; and `Debugger.didSampleProbe` delivered ordered hit samples. This is an implemented, tested Bun path—not an inference from WebKit documentation.

It is not exact CFG tracing:

- The safe imported `visit(flag)` fixture has 13 source-backed CFG nodes. The inspector supplied distinct usable locations for 10. Three executable nodes had no dedicated location: both right-hand short-circuit statements and the optional-access result node.
- Two invocations (`visit(true)` and `visit(false)`) have different expected CFG paths (16 vs 15 visits), but the inspector produced the same 14-event direct-location trace for each. It misses three dynamic CFG visits in total and cannot distinguish the path difference. Raw protocol action IDs are scoped to the imported `workflow.ts`; replay IDs are not themselves CFG IDs. The audit maps known fixture locations to CFG IDs only for this comparison. This does not establish a general source-to-CFG mapping.
- A separate 10,000-iteration loop keeps the same total (`49,995,000`) but crosses an explicit 10 ms deadline: unobserved `0.476 ms`, instrumented probe observation `1,548.632 ms`, **within-deadline → missed-deadline** with 30,008 probe samples. The same run's no-probe inspector control remained within the deadline. This is an observable timing change and violates the no-exclusions requirement; it is not discarded as debugger overhead.

On the non-timing fixture, baseline and observed stdout matched exactly, including `Function.toString()` and error-stack text, and the inspector reported zero pauses after startup. These bounded parity results do not undo the timing counterexample or prove universal neutrality.

**Conclusion:** stop this probe-breakpoint path for the strict contract. This does not prove every native Bun observation mechanism impossible. It does show that the tested Bun inspector action path cannot be treated as one event per source-backed CFG node with unchanged behavior. Do not weaken the contract or close issue #75 based on this fixture.

## Reproduce

From the repository root, on the recorded Bun version:

```sh
bash prototypes/native-bun-inspector/run.sh
```

The script runs only `fixture/main.ts` and `fixture/timing.ts`; captures the WebSocket protocol and live probe order in a temporary directory; hashes fixture sources before/after; checks exact baseline values and the bounded traces; and writes `audit.json`. It starts the target with `--inspect-wait`, explicitly requests `Debugger.pause` to establish the initial stop, then resumes and uses auto-continuing probe actions. No target source is rewritten by the runner. The disposable fixtures themselves are source files, not generated replacements.

The previous verified raw capture is in `/tmp/rv-bun-inspector-verified.Y8v6km/` in this session. Re-running generates fresh measurements, so absolute timings may vary. The tested threshold crossing, control, event count, and unchanged computation result are the relevant observations.

## Evidence and boundary

- Fixture: [`fixture/workflow.ts`](fixture/workflow.ts), imported by [`fixture/main.ts`](fixture/main.ts); timing counterexample: [`fixture/timing.ts`](fixture/timing.ts).
- Protocol runner and assertions: [`inspect.mjs`](inspect.mjs), [`audit.mjs`](audit.mjs), [`run.sh`](run.sh).
- Captured Bun protocol version, representative raw request/response/event messages, location list, and measured timing outcome: [`protocol-excerpt.json`](protocol-excerpt.json).
- Raw fixture-specific expected/observed CFG paths and location-hit table: `audit.json` under the run's temporary evidence root.
- Official Bun docs: [Runtime debugger](https://bun.sh/docs/runtime/debugger) (Bun speaks WebKit Inspector Protocol).
- Exact installed-version protocol: [Bun `bun-v1.3.14` JSC protocol](https://github.com/oven-sh/bun/blob/bun-v1.3.14/packages/bun-inspector-protocol/src/protocol/jsc/protocol.json). Its `Debugger` domain defines breakpoint locations/actions, `autoContinue`, `probe`, and `didSampleProbe`.
- No claim is made about all JS/TS constructs, universal probe overhead, exception paths, every source-map shape, or every other Bun/native observation approach. The failure is already sufficient for the tested candidate under the stated no-timing-change requirement.
