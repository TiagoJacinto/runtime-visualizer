import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createApp } from "../../../src/shared/infra/http/app.ts";

const resources: {
  app: Awaited<ReturnType<typeof createApp>>;
  directory: string;
}[] = [];

afterEach(async () => {
  await Promise.all(
    resources.splice(0).map(async ({ app, directory }) => {
      await app.close();
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe("analysis revision API", () => {
  it("does not re-analyze an explicitly unavailable revision", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "runtime-visualizer-http-"),
    );
    await writeFile(
      path.join(directory, "main.ts"),
      "function prepare() { return 1; }\n",
    );
    const app = await createApp({ filesFolder: directory });
    resources.push({ app, directory });

    const response = await app.inject({
      method: "GET",
      url: "/api/analysis?file=main.ts&procedureId=missing&revision=gone",
    });

    // result verification
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "Revision unavailable" });
  });
});
