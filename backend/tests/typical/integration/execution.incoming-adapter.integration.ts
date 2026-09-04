import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/shared/infra/http/app.js";

describe("execution incoming adapter", () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let folder: string | undefined;
  afterEach(async () => { await app?.close(); if (folder) await fs.rm(folder, { recursive: true, force: true }); });

  async function setup(source: string) {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
    await fs.writeFile(path.join(folder, "main.ts"), source);
    app = await createApp({ filesFolder: folder });
    const procedures = await app.inject({ method: "GET", url: "/api/procedures?file=main.ts" });
    const discovered = procedures.json() as { procedures: Array<{ id: string }> };
    const procedureId = discovered.procedures.at(-1)?.id;
    if (!procedureId) throw new Error("test procedure was not discovered");
    const analyzed = await app.inject({ method: "GET", url: `/api/analysis?file=main.ts&procedureId=${encodeURIComponent(procedureId)}` });
    if (analyzed.statusCode !== 200) throw new Error(`analysis ${analyzed.statusCode}: ${analyzed.body}`);
    const savedRevision = (analyzed.json() as { revision: string }).revision;
    return { file: "main.ts", procedureId, revision: savedRevision };
  }

  it("accepts the exact revision request and returns only the execution ID", async () => {
    const request = await setup("function greet() { return 42; }\n");
    const response = await app!.inject({ method: "POST", url: "/api/execute", payload: request });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ executionId: expect.any(String) });
    expect(response.headers["x-execution-id"]).toBeUndefined();
  });

  it("lists active executions and removes them after terminal completion", async () => {
    const request = await setup("function greet() { return 42; }\n");
    const started = await app!.inject({ method: "POST", url: "/api/execute", payload: request });
    const executionId = (started.json() as { executionId: string }).executionId;
    const active = await app!.inject({ method: "GET", url: "/api/execute" });
    expect(active.json()).toEqual({ executions: [expect.objectContaining({ executionId, scope: request, status: "Running" })] });
    for (let i = 0; i < 200; i++) {
      const listed = await app!.inject({ method: "GET", url: "/api/execute" });
      if ((listed.json() as { executions: unknown[] }).executions.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const done = await app!.inject({ method: "GET", url: "/api/execute" });
    expect(done.json()).toEqual({ executions: [] });
  }, 15_000);

  it("cancels a server-owned execution and returns 404 for unknown IDs", async () => {
    const request = await setup("function spin() { while (true) {} }\n");
    const started = await app!.inject({ method: "POST", url: "/api/execute", payload: request });
    const executionId = (started.json() as { executionId: string }).executionId;
    expect((await app!.inject({ method: "DELETE", url: `/api/execute/${executionId}` })).statusCode).toBe(202);
    expect((await app!.inject({ method: "DELETE", url: "/api/execute/unknown" })).statusCode).toBe(404);
  });

  it("rejects an unavailable exact revision without name-based fallback", async () => {
    const request = await setup("function run() { return 1; }\n");
    const response = await app!.inject({ method: "POST", url: "/api/execute", payload: { ...request, revision: "missing" } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "Revision unavailable" });
  });
});
