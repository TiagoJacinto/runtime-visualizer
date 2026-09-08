import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../src/shared/infra/http/app.ts";

const source = `function main() { work(); }
work();
function work() {}`;

type Procedure = { id: string; name: string | null };
type Analysis = {
  procedureId: string;
  cfg: {
    procedures: Array<{
      nodes: Array<{ label: string; location?: { start: { line: number } } }>;
    }>;
  } | null;
  revision: string;
};

async function setup(folder: string, sourceText = source) {
  await fs.writeFile(path.join(folder, "main.ts"), sourceText);
  const app = await createApp({ filesFolder: folder });
  const discovered = await app.inject({
    method: "GET",
    url: "/api/procedures?file=main.ts",
  });
  const procedures = (discovered.json() as { procedures: Procedure[] })
    .procedures;
  return { app, procedures };
}

async function analyse(
  app: Awaited<ReturnType<typeof createApp>>,
  procedureId: string,
): Promise<Analysis> {
  const response = await app.inject({
    method: "GET",
    url: `/api/analysis?file=main.ts&procedureId=${encodeURIComponent(procedureId)}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as Analysis;
}

async function nextTerminal(
  response: Response,
  executionId: string,
): Promise<{ status: string; error?: string }> {
  if (response.body === null) throw new Error("Expected an SSE response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done)
        throw new Error("SSE stream closed before execution completed");
      buffer += decoder.decode(result.value, { stream: true });
      const records = buffer.split("\n\n");
      buffer = records.pop() ?? "";
      for (const record of records) {
        if (!record.split("\n").includes("event: execution-update")) continue;
        const line = record
          .split("\n")
          .find((item) => item.startsWith("data: "));
        if (line === undefined) continue;
        const event = JSON.parse(line.slice("data: ".length)) as {
          update?: { executionId: string; status: string; error?: string };
        };
        if (
          event.update?.executionId === executionId &&
          event.update.status !== "Running"
        )
          return event.update;
      }
    }
  } finally {
    await reader.cancel();
  }
}

describe("Procedure selection HTTP seam", () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let folder: string | undefined;

  afterEach(async () => {
    await app?.close();
    if (folder !== undefined)
      await fs.rm(folder, { recursive: true, force: true });
    app = undefined;
    folder = undefined;
  });

  it("analyzes and executes the file Procedure by default", async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
    const setupResult = await setup(folder);
    app = setupResult.app;
    const topLevel = setupResult.procedures[0];
    if (topLevel === undefined) throw new Error("Expected a file Procedure");
    const analysis = await analyse(app, topLevel.id);
    expect(
      analysis.cfg?.procedures[0]?.nodes.map((node) => node.label),
    ).toEqual(["Entry", "work()", "Exit"]);
    expect(analysis.cfg?.procedures[0]?.nodes[1]?.location?.start.line).toBe(2);
    const started = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: {
        file: "main.ts",
        procedureId: topLevel.id,
        revision: analysis.revision,
      },
    });
    expect(started.statusCode).toBe(202);
    const executionId = (started.json() as { executionId: string }).executionId;
    const active = await app.inject({ method: "GET", url: "/api/execute" });
    expect(active.json()).toEqual({
      executions: [expect.objectContaining({ executionId, status: "Running" })],
    });
    expect(executionId).toEqual(expect.any(String));
  }, 30_000);

  it("analyzes and executes a Function only when explicitly selected", async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
    const setupResult = await setup(folder);
    app = setupResult.app;
    const selected = setupResult.procedures.find(
      (procedure) => procedure.id === "function:main",
    );
    if (selected === undefined)
      throw new Error("Expected main Function Procedure");
    const analysis = await analyse(app, selected.id);
    expect(
      analysis.cfg?.procedures[0]?.nodes.map((node) => node.label),
    ).toEqual(["Entry", "work()", "Exit"]);
    expect(analysis.cfg?.procedures[0]?.nodes[1]?.location?.start.line).toBe(1);

    const events = await fetch(
      `${await app.listen({ port: 0, host: "127.0.0.1" })}/api/events`,
    );
    const started = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: {
        file: "main.ts",
        procedureId: selected.id,
        revision: analysis.revision,
      },
    });
    expect(started.statusCode).toBe(202);
    const executionId = (started.json() as { executionId: string }).executionId;
    expect(await nextTerminal(events, executionId)).toMatchObject({
      status: "Succeeded",
    });
  }, 30_000);

  it("executes a top-level Procedure that contains exported declarations", async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-visualizer-"));
    const setupResult = await setup(
      folder,
      `export function run() { console.log("ok"); }\nrun();`,
    );
    app = setupResult.app;
    const topLevel = setupResult.procedures[0];
    if (topLevel === undefined) throw new Error("Expected a file Procedure");
    const analysis = await analyse(app, topLevel.id);
    const started = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: {
        file: "main.ts",
        procedureId: topLevel.id,
        revision: analysis.revision,
      },
    });
    expect(started.statusCode).toBe(202);
    const executionId = (started.json() as { executionId: string }).executionId;
    expect(executionId).toEqual(expect.any(String));
    const active = await app.inject({ method: "GET", url: "/api/execute" });
    expect(active.json()).toEqual({
      executions: [
        expect.objectContaining({
          executionId,
          scope: {
            file: "main.ts",
            procedureId: topLevel.id,
            revision: analysis.revision,
          },
          status: "Running",
        }),
      ],
    });
  }, 30_000);
});
