// Throwaway research controller: no preload, transform, or writes to target source.
/* oxlint-disable no-await-in-loop, promise/avoid-new, promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- Sequential inspector setup and correlated WebSocket responses are deliberately ordered; the event callback resumes the paused VM. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [
  fixtureName = "main.ts",
  mode = "probe",
  outputDirectory = "/tmp/bun-inspector-evidence",
] = process.argv.slice(2);
assert.ok(
  ["main.ts", "timing.ts"].includes(fixtureName),
  "Only the two safe fixtures may run"
);
assert.ok(
  ["probe", "control"].includes(mode),
  "Only the measured probe and control modes may run"
);
mkdirSync(outputDirectory, { recursive: true });
const fixture = path.join(import.meta.dirname, "fixture", fixtureName);
const baseline = Bun.spawnSync([process.execPath, fixture]);
const raw = [];
const events = [];
const scripts = [];
const breakpointResults = [];
const replay = [];
const pending = new Map();
let nextId = 0;
let socket;
let failure;
let stderr = "";
let initialPause;
let running = false;
let target;
const child = Bun.spawn(
  [process.execPath, "--inspect-wait=127.0.0.1:0/rv-feasibility", fixture],
  {
    stderr: "pipe",
    stdout: "pipe",
  }
);
const watchdog = setTimeout(() => {
  failure = new Error("15-second experiment bound exceeded");
  child.kill();
  socket?.close();
}, 15_000);
const stdoutPromise = new Response(child.stdout).text();
const stderrPromise = (async () => {
  for await (const chunk of child.stderr) {
    stderr += new TextDecoder().decode(chunk);
  }
})();
const waitFor = async (predicate) => {
  const start = performance.now();
  while (!predicate()) {
    if (failure) {
      throw failure;
    }
    if (performance.now() - start > 5000) {
      throw new Error("5-second protocol wait exceeded");
    }
    await Bun.sleep(5);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    nextId += 1;
    const message = { id: nextId, method, params };
    raw.push({ direction: "send", message, sequence: raw.length + 1 });
    pending.set(message.id, { reject, resolve });
    socket.send(JSON.stringify(message));
  });
try {
  await waitFor(() => stderr.match(/ws:\/\/[^\s]+/u));
  const [url] = stderr.match(/ws:\/\/[^\s]+/u);
  socket = new WebSocket(url);
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    raw.push({ direction: "receive", message, sequence: raw.length + 1 });
    if (message.id === undefined) {
      events.push(message);
      if (message.method === "Debugger.scriptParsed") {
        scripts.push(message.params);
      }
      if (message.method === "Debugger.didSampleProbe") {
        replay.push({ sequence: replay.length + 1, ...message.params.sample });
      }
      if (message.method === "Debugger.paused") {
        if (running) {
          void send("Debugger.resume").catch((error) => {
            failure = error;
          });
        } else {
          initialPause = message.params;
        }
      }
    } else {
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id);
        // Keep protocol errors as evidence; unsupported is not a harness crash.
        request.resolve(message);
      }
    }
  });
  socket.addEventListener("error", () => {
    failure = new Error("Inspector WebSocket error");
  });
  await waitFor(() => socket.readyState === WebSocket.OPEN);
  for (const method of [
    "Inspector.enable",
    "Runtime.enable",
    "Debugger.enable",
    "Console.enable",
  ]) {
    const response = await send(method);
    assert.equal(response.error, undefined, method);
  }
  await send("Debugger.setBreakpointsActive", { active: true });
  await send("Debugger.setPauseOnExceptions", { state: "none" });
  // Explicitly pause on the next statement before releasing inspect-wait.
  const pauseResponse = await send("Debugger.pause");
  assert.equal(
    pauseResponse.error,
    undefined,
    "Pause-on-next-statement must install"
  );
  await send("Inspector.initialized");
  await waitFor(() => initialPause !== undefined);
  const subjects = scripts.filter(
    (script) =>
      script.url.startsWith(path.dirname(fixture)) ||
      script.url.startsWith(`file://${path.dirname(fixture)}`)
  );
  let actionId = 0;
  for (const script of subjects) {
    const sourceResponse = await send("Debugger.getScriptSource", {
      scriptId: script.scriptId,
    });
    writeFileSync(
      path.join(
        outputDirectory,
        `${path.basename(script.url)}.inspector-source.txt`
      ),
      sourceResponse.result?.scriptSource ?? JSON.stringify(sourceResponse)
    );
    const locationsResponse = await send("Debugger.getBreakpointLocations", {
      end: {
        columnNumber: 0,
        lineNumber: script.endLine + 1,
        scriptId: script.scriptId,
      },
      start: { columnNumber: 0, lineNumber: 0, scriptId: script.scriptId },
    });
    const locations = locationsResponse.result?.locations ?? [];
    breakpointResults.push({ locationsResponse, script });
    if (mode !== "control") {
      for (const location of locations) {
        actionId += 1;
        const options = {
          actions: [{ data: "0", id: actionId, type: "probe" }],
          autoContinue: true,
        };
        const response = await send("Debugger.setBreakpoint", {
          location,
          options,
        });
        breakpointResults.push({
          actionId,
          requested: location,
          response,
        });
      }
    }
  }
  running = true;
  await send("Debugger.resume");
  // Subjects print one final JSON result after the selected functions finish.
  // Bun keeps an attached debugger alive after top-level work completes.
  await waitFor(() =>
    events.some(
      (event) =>
        event.method === "Console.messageAdded" &&
        event.params.message.text.startsWith("{")
    )
  );
  await Bun.sleep(50);
  socket.close();
  const exitCode = await child.exited;
  const stdout = await stdoutPromise;
  await stderrPromise;
  socket.close();
  const rawSamples = raw
    .filter(
      (record) =>
        record.direction === "receive" &&
        record.message.method === "Debugger.didSampleProbe"
    )
    .map((record, index) => ({
      sequence: index + 1,
      ...record.message.params.sample,
    }));
  assert.deepEqual(
    replay,
    rawSamples,
    "Retained replay must equal live received sample order"
  );
  target = { exitCode, stderr, stdout };
} catch (error) {
  failure = error;
  child.kill();
  socket?.close();
  await child.exited;
  target = { exitCode: child.exitCode, stderr, stdout: await stdoutPromise };
} finally {
  clearTimeout(watchdog);
}
const result = {
  baseline: {
    exitCode: baseline.exitCode,
    stderr: baseline.stderr.toString(),
    stdout: baseline.stdout.toString(),
  },
  breakpointResults,
  bun: Bun.version,
  commands: {
    baseline: [process.execPath, fixture],
    inspected: [
      process.execPath,
      "--inspect-wait=127.0.0.1:0/rv-feasibility",
      fixture,
    ],
  },
  error: failure?.stack ?? null,
  fixture,
  mode,
  pausedAfterStart:
    events.filter((event) => event.method === "Debugger.paused").length -
    (initialPause ? 1 : 0),
  replay,
  revision: Bun.revision,
  scripts,
  target,
};
writeFileSync(
  path.join(outputDirectory, "protocol.jsonl"),
  `${raw.map((record) => JSON.stringify(record)).join("\n")}\n`
);
writeFileSync(
  path.join(outputDirectory, "live.jsonl"),
  `${replay.map((record) => JSON.stringify(record)).join("\n")}\n`
);
writeFileSync(
  path.join(outputDirectory, "result.json"),
  `${JSON.stringify(result, null, 2)}\n`
);
console.log(
  JSON.stringify(
    {
      breakpoints: breakpointResults.length,
      error: result.error,
      mode,
      outputDirectory,
      pausedAfterStart: result.pausedAfterStart,
      samples: replay.length,
      sourceScripts: scripts
        .filter((script) => script.url !== "")
        .map((script) => script.url),
      stdoutParity: result.baseline.stdout === target.stdout,
    },
    null,
    2
  )
);
if (failure) {
  process.exitCode = 1;
}
