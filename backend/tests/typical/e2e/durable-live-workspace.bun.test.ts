import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../../src/shared/infra/http/app.ts";

describe("durable live workspace contract", () => {
  test(
    "loads and executes a selected revision after restart and source deletion",
    async () => {
      const folder = await mkdtemp(
        path.join(os.tmpdir(), "runtime-visualizer-live-"),
      );
      const databasePath = path.join(folder, "history", "revisions.sqlite");
      const sourcePath = path.join(folder, "main.ts");
      let app: Awaited<ReturnType<typeof createApp>> | undefined;

      try {
        await writeFile(sourcePath, "export const value = 42;\n", "utf8");
        app = await createApp({ filesFolder: folder, databasePath });

        const procedures = await app.inject({
          method: "GET",
          url: "/api/procedures?file=main.ts",
        });
        expect(procedures.statusCode).toBe(200);
        const procedureId = (
          procedures.json() as { procedures: Array<{ id: string }> }
        ).procedures[0]?.id;
        expect(procedureId).toBe("top-level");

        const current = await app.inject({
          method: "GET",
          url: "/api/analysis?file=main.ts&procedureId=top-level",
        });
        expect(current.statusCode).toBe(200);
        const revision = (current.json() as { revision: string }).revision;
        expect(revision).toHaveLength(64);

        await app.close();
        app = undefined;
        await unlink(sourcePath);

        app = await createApp({ filesFolder: folder, databasePath });
        const historical = await app.inject({
          method: "GET",
          url: `/api/analysis?file=main.ts&procedureId=top-level&revision=${revision}`,
        });
        expect(historical.statusCode).toBe(200);
        expect(historical.json()).toMatchObject({
          file: "main.ts",
          procedureId: "top-level",
          revision,
          source: "export const value = 42;\n",
        });

        const started = await app.inject({
          method: "POST",
          url: "/api/execute",
          payload: { file: "main.ts", procedureId: "top-level", revision },
        });
        expect(started.statusCode).toBe(202);
        const executionId = (started.json() as { executionId?: unknown })
          .executionId;
        expect(typeof executionId).toBe("string");

        for (let attempt = 0; attempt < 100; attempt += 1) {
          const active = await app.inject({
            method: "GET",
            url: "/api/execute",
          });
          if (
            (active.json() as { executions: unknown[] }).executions.length === 0
          )
            return;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error(
          "historical execution did not reach a terminal outcome",
        );
      } finally {
        await app?.close();
        await rm(folder, { recursive: true, force: true });
      }
    },
    { timeout: 30_000 },
  );
});
