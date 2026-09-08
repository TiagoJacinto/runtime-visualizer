import { afterEach, describe, expect, it } from "vitest";
import {
  setupExecutionFixture,
  type ExecutionFixture,
} from "./fixtures/execution-fixture.ts";

describe("execution incoming adapter", () => {
  let fixture: ExecutionFixture | undefined;

  afterEach(async () => {
    await fixture?.close();
    fixture = undefined;
  });

  it("accepts the exact revision request and returns only the execution ID", async () => {
    const current = await setupExecutionFixture(
      "function greet() { return 42; }\n",
    );
    fixture = current;
    const { app, scope } = current;
    const response = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: scope,
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ executionId: expect.any(String) });
    expect(response.headers["x-execution-id"]).toBeUndefined();
  });

  it("lists active executions and removes them after terminal completion", async () => {
    const current = await setupExecutionFixture(
      "function greet() { return 42; }\n",
    );
    fixture = current;
    const { app, scope, active, waitForEmpty } = current;
    const started = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: scope,
    });
    const executionId = (started.json() as { executionId: string }).executionId;
    expect(await active()).toEqual({
      executions: [
        expect.objectContaining({
          executionId,
          scope,
          status: "Running",
        }),
      ],
    });

    await waitForEmpty();
    expect(await active()).toEqual({ executions: [] });
  });

  it("cancels a server-owned execution and returns 404 for unknown IDs", async () => {
    const current = await setupExecutionFixture(
      "function spin() { while (true) {} }\n",
    );
    fixture = current;
    const { app, scope } = current;
    const started = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: scope,
    });
    const executionId = (started.json() as { executionId: string }).executionId;
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/execute/${executionId}`,
        })
      ).statusCode,
    ).toBe(202);
    expect(
      (await app.inject({ method: "DELETE", url: "/api/execute/unknown" }))
        .statusCode,
    ).toBe(404);
  });

  it("rejects an unavailable exact revision without name-based fallback", async () => {
    const current = await setupExecutionFixture(
      "function run() { return 1; }\n",
    );
    fixture = current;
    const { app, scope } = current;
    const response = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: { ...scope, revision: "missing" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "Revision unavailable" });
  });
});
