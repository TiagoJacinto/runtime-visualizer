import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

const root = mkdtempSync(join(tmpdir(), "laf-opencode-test-"));
const fake = join(root, "opencode");
writeFileSync(
  fake,
  '#!/bin/sh\ncount_file="' +
    root +
    '/calls"\ncount=$(cat "$count_file" 2>/dev/null || printf 0)\nprintf \'%s\' "$((count + 1))" > "$count_file"\nprintf \'%s\\n\' "$@" > "' +
    root +
    '/args"\nprintf \'%s\\n\' \'{"type":"step_start","sessionID":"ses-test"}\'\ncase "$*" in\n  *envelope*) printf \'%s\\n\' \'{"type":"text","sessionID":"ses-test","part":{"text":"{\\"status\\":\\"success\\",\\"summary\\":\\"done\\"}"}}\' ;;\n  *) printf \'%s\\n\' \'{"type":"tool_use","sessionID":"ses-test","part":{"tool":"edit","callID":"call-1","state":{"status":"completed","input":{"filePath":"notes/cli.py"},"output":"ok"}}}\'; sleep 1; printf \'late\' > "' +
    root +
    '/late" ;;\nesac\n',
);
chmodSync(fake, 0o755);
process.env.OPENCODE_PATH = fake;
const { runtime } = await import("./agent_opencode");

test("translates OpenCode edit completion through the Pi handoff seam", async () => {
  const events: any[] = [];
  const sessionDir = join(root, "session");
  const result = await runtime.run(
    {
      prompt: "task",
      systemPrompt: "system",
      model: "opencode/mimo-v2.5-free",
      thinking: "low",
      sessionId: "sid",
      sessionDir,
      rawOutputPath: join(sessionDir, "raw.jsonl"),
      stderrPath: join(sessionDir, "stderr.log"),
      tools: ["read", "edit"],
      cwd: root,
      allowedEnv: [],
      timeoutMs: 5000,
      maxOutputBytes: 100000,
      stopWhen: (event: any) => event.type === "tool_execution_end" && event.toolName === "edit",
    },
    (event) => events.push(event),
  );
  expect(result.text).toBe("");
  expect(events.map((event) => event.type)).toEqual(["tool_execution_start", "tool_execution_end"]);
  expect(events[1].toolName).toBe("edit");
  expect(existsSync(join(root, "late"))).toBe(false);

  const continuationEvents: any[] = [];
  const continuation = await runtime.run(
    {
      prompt: "envelope",
      systemPrompt: "system",
      model: "opencode/mimo-v2.5-free",
      thinking: "off",
      sessionId: "sid",
      sessionDir,
      rawOutputPath: join(sessionDir, "continuation.raw.jsonl"),
      stderrPath: join(sessionDir, "continuation.stderr.log"),
      tools: ["read", "bash"],
      cwd: root,
      allowedEnv: [],
      timeoutMs: 5000,
      maxOutputBytes: 100000,
    },
    (event) => continuationEvents.push(event),
  );
  expect(continuation.returncode).toBe(0);
  expect(continuationEvents.map((event) => event.type)).toEqual(["message_end", "agent_end"]);
  expect(continuation.text).toContain('"status":"success"');
  expect(readFileSync(join(root, "calls"), "utf8")).toBe("2");
  expect(readFileSync(join(root, "args"), "utf8")).toContain("--session\nses-test");
  expect(readFileSync(join(root, "args"), "utf8")).toContain("Runtime thinking level: off.");
  rmSync(root, { recursive: true, force: true });
});

test("accepts explicit OpenCode provider/model identifiers", () => {
  expect(runtime.resolveModel("opencode/mimo-v2.5-free")).toEqual(["opencode", "mimo-v2.5-free"]);
});
