import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/shared/infra/http/app.js";

type ExecutionScope = { file: string; procedureId: string; revision: string };
type ActiveResponse = {
  executions: Array<{
    executionId: string;
    displayNumber: number;
    status: string;
  }>;
};

describe("server-owned ExecutionManager integration", () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let folder: string | undefined;

  afterEach(async () => {
    await app?.close();
    if (folder) await fs.rm(folder, { recursive: true, force: true });
  });

  async function setup(source: string): Promise<ExecutionScope> {
    folder = await fs.mkdtemp(
      path.join(os.tmpdir(), "runtime-visualizer-execution-manager-"),
    );
    await fs.writeFile(path.join(folder, "main.ts"), source);
    app = await createApp({ filesFolder: folder });
    const procedures = await app.inject({
      method: "GET",
      url: "/api/procedures?file=main.ts",
    });
    const procedureId = (
      procedures.json() as { procedures: Array<{ id: string }> }
    ).procedures.at(-1)?.id;
    if (!procedureId) throw new Error("test procedure was not discovered");
    const analysis = await app.inject({
      method: "GET",
      url: `/api/analysis?file=main.ts&procedureId=${encodeURIComponent(procedureId)}`,
    });
    expect(analysis.statusCode).toBe(200);
    return {
      file: "main.ts",
      procedureId,
      revision: (analysis.json() as { revision: string }).revision,
    };
  }

  async function active(): Promise<ActiveResponse> {
    return (
      await app!.inject({ method: "GET", url: "/api/execute" })
    ).json() as ActiveResponse;
  }

  async function waitForEmpty(): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await active()).executions.length === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("execution did not leave Active Runs");
  }

  it("keeps concurrent server runs independent and assigns distinct display numbers", async () => {
    const scope = await setup("function spin() { while (true) {} }\n");
    const responses = await Promise.all([
      app!.inject({ method: "POST", url: "/api/execute", payload: scope }),
      app!.inject({ method: "POST", url: "/api/execute", payload: scope }),
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
          await app!.inject({
            method: "DELETE",
            url: `/api/execute/${run.executionId}`,
          })
        ).statusCode,
      ).toBe(202);
    }
    await waitForEmpty();
  });

  it("removes a completed run from Active Runs after publishing its terminal outcome", async () => {
    const scope = await setup("function complete() { return 42; }\n");
    const started = await app!.inject({
      method: "POST",
      url: "/api/execute",
      payload: scope,
    });
    expect(started.statusCode).toBe(202);
    const executionId = (started.json() as { executionId: string }).executionId;
    expect((await active()).executions).toEqual([
      expect.objectContaining({ executionId, status: "Running" }),
    ]);

    await waitForEmpty();
    expect(
      (
        await app!.inject({
          method: "DELETE",
          url: `/api/execute/${executionId}`,
        })
      ).statusCode,
    ).toBe(404);
  }, 15_000);

  it("cancels a running execution and rejects unknown IDs without affecting other runs", async () => {
    const scope = await setup("function spin() { while (true) {} }\n");
    const first = await app!.inject({
      method: "POST",
      url: "/api/execute",
      payload: scope,
    });
    const second = await app!.inject({
      method: "POST",
      url: "/api/execute",
      payload: scope,
    });
    const firstId = (first.json() as { executionId: string }).executionId;
    const secondId = (second.json() as { executionId: string }).executionId;

    expect(
      (
        await app!.inject({
          method: "DELETE",
          url: "/api/execute/not-an-execution",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app!.inject({ method: "DELETE", url: `/api/execute/${firstId}` }))
        .statusCode,
    ).toBe(202);
    const remaining = await active();
    expect(remaining.executions.map((run) => run.executionId)).toEqual([
      secondId,
    ]);

    expect(
      (await app!.inject({ method: "DELETE", url: `/api/execute/${secondId}` }))
        .statusCode,
    ).toBe(202);
    await waitForEmpty();
  });
});
