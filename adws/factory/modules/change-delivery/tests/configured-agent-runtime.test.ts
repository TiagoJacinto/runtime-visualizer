import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import {
  ConfiguredAgentRuntime,
  type AgentRuntime,
} from "../configured-agent-runtime";

function setup(prewalk = false) {
  const root = mkdtempSync(join(tmpdir(), "configured-agent-"));
  const system = join(root, "system.md"),
    user = join(root, "user.md");
  writeFileSync(system, "system");
  writeFileSync(user, "{{prompt}}");
  const config = join(root, "config.yaml");
  writeFileSync(
    config,
    JSON.stringify({
      defaults: { data_dir: `${root}/data` },
      agents: [
        {
          name: "planner",
          coding_agent: "pi",
          model: "test/model",
          thinking: "medium",
          tools: ["todo", "bash"],
          writes: ["allowed.txt"],
          ...(prewalk
            ? {
                prewalk: {
                  implementation_model: "test/implementation",
                  implementation_thinking: "high",
                },
              }
            : {}),
          prompt_engineering: { system, user },
        },
      ],
    }),
  );

  return { root, config };
}

const fakeRuntime = (
  results: Array<{ text: string; stop?: boolean }>,
  calls: Array<any>,
): AgentRuntime => ({
  resolveModel: (model) => [model.split("/")[0], model] as const,
  assertCredential: () => undefined,
  contextWindow: () => 1,
  run: async (request) => {
    calls.push(request);
    const result = results.shift() ?? { text: '{"status":"success"}' };
    if (result.stop) {
      request.stopWhen?.({ toolName: "todo" });
      request.stopWhen?.({ toolName: "edit" });
    }
    return {
      text: result.text,
      returncode: 0,
      session_id: request.sessionId,
      tokens: 0,
      cost: 0,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: 0,
        input_cost: 0,
        output_cost: 0,
        cache_read_cost: 0,
        cache_write_cost: 0,
        total_cost: 0,
      },
      context_tokens: 0,
      context_window: 1,
    };
  },
});

describe("configured agent runtime fidelity", () => {
  test("reuses a run-owner session and includes prior artifact context", async () => {
    const { config } = setup();
    const calls: any[] = [];
    const runtime = new ConfiguredAgentRuntime(config, {
      pi: fakeRuntime(
        [{ text: '{"status":"success"}' }, { text: '{"status":"success"}' }],
        calls,
      ),
      opencode: fakeRuntime([], []),
    });
    await runtime.invoke({
      invocationId: "one",
      runIdentifier: "run",
      name: "a",
      input: "first",
      options: { agentOwner: "planner" },
      signal: new AbortController().signal,
    });
    await runtime.invoke({
      invocationId: "two",
      runIdentifier: "run",
      name: "b",
      input: "second",
      inputArtifact: { id: "plan", value: { answer: 42 } },
      options: { agentOwner: "planner" },
      signal: new AbortController().signal,
    });
    expect(calls[0].sessionId).toBe(calls[1].sessionId);
    expect(calls[1].prompt).toContain("42");
  });

  test("corrects malformed envelopes in the same session", async () => {
    const { config } = setup();
    const calls: any[] = [];
    const runtime = new ConfiguredAgentRuntime(config, {
      pi: fakeRuntime(
        [{ text: "not json" }, { text: '{"status":"success"}' }],
        calls,
      ),
      opencode: fakeRuntime([], []),
    });
    const result = await runtime.invoke({
      invocationId: "one",
      runIdentifier: "run",
      name: "a",
      input: "request",
      options: { agentOwner: "planner" },
      signal: new AbortController().signal,
    });
    expect((result as any).value.status).toBe("success");
    expect(calls[0].sessionId).toBe(calls[1].sessionId);
    expect(calls[1].prompt).toContain("malformed");
  });

  test("switches prewalk model immediately after the first write", async () => {
    const { config } = setup(true);
    const calls: any[] = [];
    const runtime = new ConfiguredAgentRuntime(config, {
      pi: fakeRuntime(
        [{ text: "partial", stop: true }, { text: '{"status":"success"}' }],
        calls,
      ),
      opencode: fakeRuntime([], []),
    });
    await runtime.invoke({
      invocationId: "one",
      runIdentifier: "run",
      name: "a",
      input: "request",
      options: { agentOwner: "planner" },
      signal: new AbortController().signal,
    });
    expect(calls.map((call) => call.model)).toEqual([
      "test/model",
      "test/implementation",
    ]);
    expect(calls[0].sessionId).toBe(calls[1].sessionId);
  });
});
