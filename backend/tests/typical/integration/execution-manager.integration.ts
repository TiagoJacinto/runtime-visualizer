import { afterEach, describe, expect, it } from "vitest";
import {
  setupExecutionFixture,
  type ExecutionFixture,
} from "./fixtures/execution-fixture.ts";

describe("server-owned ExecutionManager integration", () => {
  let fixture: ExecutionFixture | undefined;

  afterEach(async () => {
    await fixture?.close();
    fixture = undefined;
  });

  it("keeps concurrent server runs independent and assigns distinct display numbers", async () => {
    const current = await setupExecutionFixture(
      "function spin() { while (true) {} }\n",
    );
    fixture = current;
    const { app, scope, active, waitForEmpty } = current;
    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/api/execute", payload: scope }),
      app.inject({ method: "POST", url: "/api/execute", payload: scope }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      202, 202,
    ]);

    const runs = await active();
    expect(runs.executions).toHaveLength(2);
    expect(runs.executions.every((run) => run.status === "Running")).toBe(true);
    expect(new Set(runs.executions.map((run) => run.displayNumber)).size).toBe(
      2,
    );
    expect(runs.executions[0]!.displayNumber).toBeGreaterThan(
      runs.executions[1]!.displayNumber,
    );

    for (const run of runs.executions) {
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/api/execute/${run.executionId}`,
          })
        ).statusCode,
      ).toBe(202);
    }
    await waitForEmpty();
  });

  it("removes a completed run from Active Runs after publishing its terminal outcome", async () => {
    const current = await setupExecutionFixture(
      "function complete() { return 42; }\n",
    );
    fixture = current;
    const { app, scope, active, waitForEmpty } = current;
    const started = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: scope,
    });
    expect(started.statusCode).toBe(202);
    const executionId = (started.json() as { executionId: string }).executionId;
    expect(await active()).toEqual({
      executions: [expect.objectContaining({ executionId, status: "Running" })],
    });

    await waitForEmpty();
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/execute/${executionId}`,
        })
      ).statusCode,
    ).toBe(404);
  });

  it("cancels a running execution and rejects unknown IDs without affecting other runs", async () => {
    const current = await setupExecutionFixture(
      "function spin() { while (true) {} }\n",
    );
    fixture = current;
    const { app, scope, active, waitForEmpty } = current;
    const first = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: scope,
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: scope,
    });
    const firstId = (first.json() as { executionId: string }).executionId;
    const secondId = (second.json() as { executionId: string }).executionId;

    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/execute/not-an-execution",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "DELETE", url: `/api/execute/${firstId}` }))
        .statusCode,
    ).toBe(202);
    const remaining = await active();
    expect(remaining.executions.map((run) => run.executionId)).toEqual([
      secondId,
    ]);

    expect(
      (await app.inject({ method: "DELETE", url: `/api/execute/${secondId}` }))
        .statusCode,
    ).toBe(202);
    await waitForEmpty();
  });
});
