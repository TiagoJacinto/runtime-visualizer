import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/shared/infra/http/app.js";

describe("run Procedure revision", () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let folder: string | undefined;
  afterEach(async () => { await app?.close(); if (folder) await fs.rm(folder, { recursive: true, force: true }); });

  it("runs the exact pinned revision after its source file is deleted", async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
    const file = path.join(folder, "main.ts");
    await fs.writeFile(file, "function prepare() { return 1; }\n");
    app = await createApp({ filesFolder: folder });
    const discovered = await app.inject({ method: "GET", url: "/api/procedures?file=main.ts" });
    const body = discovered.json() as { revision: string; procedures: Array<{ id: string }> };
    const analyzed = await app.inject({ method: "GET", url: `/api/analysis?file=main.ts&procedureId=${encodeURIComponent(body.procedures.at(-1)!.id)}` });
    const request = { file: "main.ts", procedureId: body.procedures.at(-1)!.id, revision: (analyzed.json() as { revision: string }).revision };
    await fs.rm(file);
    const response = await app.inject({ method: "POST", url: "/api/execute", payload: request });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ executionId: expect.any(String) });
  });

  it("pins concurrent executions independently to one exact scope", async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
    await fs.writeFile(path.join(folder, "main.ts"), "function prepare() { return 1; }\n");
    app = await createApp({ filesFolder: folder });
    const discovered = await app.inject({ method: "GET", url: "/api/procedures?file=main.ts" });
    const body = discovered.json() as { revision: string; procedures: Array<{ id: string }> };
    const analyzed = await app.inject({ method: "GET", url: `/api/analysis?file=main.ts&procedureId=${encodeURIComponent(body.procedures.at(-1)!.id)}` });
    const request = { file: "main.ts", procedureId: body.procedures.at(-1)!.id, revision: (analyzed.json() as { revision: string }).revision };
    const responses = await Promise.all([1, 2].map(() => app!.inject({ method: "POST", url: "/api/execute", payload: request })));
    expect(responses.every((response) => response.statusCode === 202)).toBe(true);
    const active = await app.inject({ method: "GET", url: "/api/execute" });
    const executions = (active.json() as { executions: Array<{ scope: typeof request; displayNumber: number }> }).executions;
    expect(executions).toHaveLength(2);
    expect(executions.map((run) => run.scope)).toEqual([request, request]);
    expect(new Set(executions.map((run) => run.displayNumber)).size).toBe(2);
  });

  it("does not substitute a newer revision when the requested revision is unavailable", async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
    await fs.writeFile(path.join(folder, "main.ts"), "function prepare() { return 1; }\n");
    app = await createApp({ filesFolder: folder });
    const response = await app.inject({ method: "POST", url: "/api/execute", payload: { file: "main.ts", procedureId: "prepare", revision: "missing" } });
    expect(response.statusCode).toBe(409);
  });
});
