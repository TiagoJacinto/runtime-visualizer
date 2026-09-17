import { expect } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../../../../src/shared/infra/http/app.ts";

export type ExecutionScope = {
  readonly file: string;
  readonly procedureId: string;
  readonly revision: string;
};

type ActiveResponse = {
  readonly executions: readonly {
    readonly executionId: string;
    readonly displayNumber: number;
    readonly status: string;
  }[];
};

export type ExecutionFixture = {
  readonly app: Awaited<ReturnType<typeof createApp>>;
  readonly scope: ExecutionScope;
  active(): Promise<ActiveResponse>;
  waitForEmpty(): Promise<void>;
  close(): Promise<void>;
};

export async function setupExecutionFixture(
  source: string,
): Promise<ExecutionFixture> {
  const folder = await fs.mkdtemp(
    path.join(os.tmpdir(), "runtime-visualizer-execution-"),
  );
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await fs.writeFile(path.join(folder, "main.ts"), source);
    app = await createApp({ filesFolder: folder });

    const procedures = await app.inject({
      method: "GET",
      url: "/api/procedures?file=main.ts",
    });
    expect(procedures.statusCode).toBe(200);
    const discovered = procedures.json() as {
      readonly procedures: readonly { readonly id: string }[];
    };
    const procedureId = discovered.procedures.at(-1)?.id;
    expect(procedureId).toEqual(expect.any(String));
    if (procedureId === undefined)
      throw new Error("Expected the fixture Procedure to be discovered.");

    const analysis = await app.inject({
      method: "GET",
      url: `/api/analysis?file=main.ts&procedureId=${encodeURIComponent(procedureId)}`,
    });
    expect(analysis.statusCode).toBe(200);
    const analyzed = analysis.json() as {
      readonly procedureId: string;
      readonly revision: string;
    };
    expect(analyzed.procedureId).toBe(procedureId);
    expect(analyzed.revision).toEqual(expect.any(String));

    const scope: ExecutionScope = {
      file: "main.ts",
      procedureId,
      revision: analyzed.revision,
    };
    let closed = false;
    const active = async (): Promise<ActiveResponse> => {
      const response = await app!.inject({
        method: "GET",
        url: "/api/execute",
      });
      expect(response.statusCode).toBe(200);
      return response.json() as ActiveResponse;
    };
    const waitForEmpty = async (): Promise<void> => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if ((await active()).executions.length === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("Execution did not leave Active Runs.");
    };
    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await app!.close();
      await fs.rm(folder, { recursive: true, force: true });
    };
    return { app, scope, active, waitForEmpty, close };
  } catch (error) {
    await app?.close();
    await fs.rm(folder, { recursive: true, force: true });
    throw error;
  }
}
