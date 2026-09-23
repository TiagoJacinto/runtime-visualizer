/* oxlint-disable vitest/prefer-importing-vitest-globals -- This isolated Pi extension suite runs with Bun's built-in test runner. */
import { describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  appendRoutingLog,
  extractEndpoints,
  findEndpointTests,
  makeFailureEvidence,
  matchCommand,
  parseRoutingConfig,
  recommendRoute,
} from "../command-failure-routing";

const configPath = new URL("../command-failure-routing.json", import.meta.url);

const loadConfig = async () =>
  parseRoutingConfig(await readFile(configPath, "utf-8"));

describe("command failure routing", () => {
  test("routes only configured failed-command names", async () => {
    const config = await loadConfig();
    expect(config).toBeDefined();
    if (!config) {
      return;
    }

    expect(
      matchCommand(config, "bun run backend:test:integration:incoming")?.name
    ).toBe("backend incoming integration tests");
    expect(matchCommand(config, "bun run backend:test:unit")).toBeUndefined();
  });

  test("extracts endpoint paths and reports whether test files already reference them", async () => {
    const tempDir = await mkdtemp(
      path.join(tmpdir(), "endpoint-test-inventory-")
    );
    const testRoot = "backend/tests";
    const output =
      "POST /api/procedures returned 404 because it is unreachable";

    try {
      await mkdir(path.join(tempDir, testRoot), { recursive: true });
      expect(extractEndpoints(output)).toEqual([
        { method: "POST", path: "/api/procedures" },
      ]);

      const noMatches = await findEndpointTests(tempDir, [testRoot], output);
      expect(noMatches).toEqual([
        {
          endpoint: { method: "POST", path: "/api/procedures" },
          matchingTestCount: 0,
          matchingTestPaths: [],
          scanComplete: true,
        },
      ]);

      const matchingTestPath = path.join(
        tempDir,
        testRoot,
        "procedures.incoming.integration.ts"
      );
      await writeFile(
        matchingTestPath,
        'test("POST /api/procedures", () => {});'
      );
      const endToEndTestPath = path.join(
        tempDir,
        testRoot,
        "procedures.api.e2e.ts"
      );
      await writeFile(
        endToEndTestPath,
        'test("GET /api/procedures", () => {});'
      );
      const existingMatches = await findEndpointTests(
        tempDir,
        [testRoot],
        output
      );
      expect(existingMatches[0]).toMatchObject({
        matchingTestCount: 2,
        matchingTestPaths: [
          "backend/tests/procedures.api.e2e.ts",
          "backend/tests/procedures.incoming.integration.ts",
        ],
        scanComplete: true,
      });
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  test("rejects a routing command that refers to an unknown route", () => {
    const config = parseRoutingConfig(
      JSON.stringify({
        commands: [
          {
            name: "tests",
            pattern: "^test$",
            routes: ["missing"],
            testRoots: ["backend/tests"],
          },
        ],
        enabled: true,
        maxOutputChars: 4000,
        routes: [],
      })
    );
    expect(config).toBeUndefined();
  });

  test("sends bounded failure evidence to the configured Jev routes and returns its recommendation", async () => {
    const config = await loadConfig();
    expect(config).toBeDefined();
    if (!config) {
      return;
    }

    let sentFailureOutput = "";
    const endpointTests = [
      {
        endpoint: { method: "POST", path: "/api/procedures" },
        matchingTestCount: 0,
        matchingTestPaths: [],
        scanComplete: true,
      },
    ];
    const route = await recommendRoute(
      config,
      "bun run backend:test:integration:incoming",
      `Bearer token123\n${"x".repeat(5000)}`,
      ({ options, state }) => {
        sentFailureOutput = state.failureOutput;
        expect(options["create-incoming-test"]).toContain(
          "Create an incoming integration test"
        );
        expect(state.endpointTests).toEqual(endpointTests);
        return Promise.resolve("create-incoming-test");
      },
      endpointTests
    );

    expect(route?.label).toBe("Create an incoming integration test");
    expect(sentFailureOutput).not.toContain("token123");
    expect(sentFailureOutput.length).toBeLessThanOrEqual(4000);
  });

  test("sends an existing endpoint test path to Jev for the delete route", async () => {
    const config = await loadConfig();
    expect(config).toBeDefined();
    if (!config) {
      return;
    }

    const endpointTests = [
      {
        endpoint: { method: "POST", path: "/api/procedures" },
        matchingTestCount: 1,
        matchingTestPaths: [
          "backend/tests/typical/incoming/procedures.incoming.integration.ts",
        ],
        scanComplete: true,
      },
    ];
    const route = await recommendRoute(
      config,
      "bun run backend:test:integration:incoming",
      "POST /api/procedures returned 404",
      ({ options, state }) => {
        expect(state.endpointTests).toEqual(endpointTests);
        expect(options["delete-behavior-test"]).toContain("matchingTestPaths");
        return Promise.resolve("delete-behavior-test");
      },
      endpointTests
    );

    expect(route?.id).toBe("delete-behavior-test");
  });

  test("appends request and response JSONL records with private file permissions", async () => {
    const tempDir = await mkdtemp(
      path.join(tmpdir(), "command-failure-routing-")
    );
    const logPath = path.join(tempDir, "logs", "routing.jsonl");
    const entry = {
      commandName: "incoming integration tests",
      request: {
        questions: { route: { question: "Choose a route", type: "choice" } },
        state: {
          command: "bun run backend:test:integration:incoming",
          commandName: "incoming integration tests",
          failureOutput: "redacted bounded failure output",
        },
      },
      response: {
        answers: { route: { choice: "create-incoming-test" } },
        elapsedMs: 123,
        model: "jev-latest",
        ok: true,
        usage: { inputTokens: 42 },
      },
      timestamp: "2026-09-23T12:00:00.000Z",
    };

    try {
      await appendRoutingLog(entry, logPath);
      await appendRoutingLog(entry, logPath);
      const contents = await readFile(logPath, "utf-8");
      const lines = contents.trim().split("\n");

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('"request":');
      expect(lines[0]).toContain('"response":');
      expect(lines[0]).toContain(
        '"failureOutput":"redacted bounded failure output"'
      );
      const fileInfo = await stat(logPath);
      expect(fileInfo.mode.toString(8).slice(-3)).toBe("600");
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  test("redacts common credentials and bounds evidence before routing", () => {
    const evidence = makeFailureEvidence(
      "run-tests --api-key=secret-value",
      `Bearer token123\n${"x".repeat(30)}`,
      10
    );

    expect(evidence.command).toContain("[REDACTED]");
    expect(evidence.output).toBe("xxxxxxxxxx");
    expect(evidence.output).not.toContain("token123");
  });
});
