import { describe, expect, it } from "vitest";
import { createAnalysisGateway } from "../../../src/shared/api/analysisGateway";
import {
  createExecutionGateway,
  type ExecutionGatewayError,
} from "../../../src/shared/api/executionGateway";
import { createWorkspaceEventsGateway } from "../../../src/shared/api/workspaceEventsGateway";
import {
  createLocalStorageWorkspacePreferences,
  createMemoryWorkspacePreferences,
} from "../../../src/shared/api/workspacePreferences";

const scope = {
  file: "main.ts",
  procedureId: "function:run",
  revision: "revision-1",
};

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("live workspace gateways", () => {
  it("loads exact revisions and revision summaries by Procedure ID", async () => {
    const requests: string[] = [];
    const gateway = createAnalysisGateway(async (input) => {
      requests.push(String(input));
      if (String(input).includes("/revisions"))
        return response({
          file: scope.file,
          procedure: scope.procedureId,
          revisions: [],
        });
      return response({
        file: scope.file,
        procedure: {
          id: scope.procedureId,
          kind: "Function",
          name: "run",
          label: "run",
        },
        procedureId: scope.procedureId,
        revision: scope.revision,
        source: "function run() {}",
        procedures: [
          {
            id: scope.procedureId,
            kind: "Function",
            name: "run",
            label: "run",
          },
        ],
        cfg: null,
        diagnostics: [],
      });
    });

    await gateway.listRevisions(scope);
    await gateway.load(scope);
    expect(requests[0]).toContain("/api/analysis/revisions?");
    expect(requests[0]).toContain("procedureId=function%3Arun");
    expect(requests[1]).toContain("revision=revision-1");
  });

  it("uses the server-owned execution ID, active-list, and cancel endpoints", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const gateway = createExecutionGateway(async (input, init) => {
      requests.push({ url: String(input), init });
      if (init?.method === "POST")
        return response({ executionId: "execution-1" });
      if (init?.method === "DELETE") return response({ accepted: true }, 202);
      return response({ executions: [] });
    });

    await expect(gateway.start(scope)).resolves.toBe("execution-1");
    await gateway.list();
    await gateway.cancel("execution 1");
    expect(requests.map((request) => request.url)).toEqual([
      "/api/execute",
      "/api/execute",
      "/api/execute/execution%201",
    ]);
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.body).toBe(JSON.stringify(scope));
  });

  it("surfaces execution HTTP failures with their status", async () => {
    const gateway = createExecutionGateway(async () =>
      response({ error: "Revision unavailable" }, 409),
    );
    await expect(gateway.start(scope)).rejects.toEqual(
      expect.objectContaining<Partial<ExecutionGatewayError>>({
        message: "Revision unavailable",
        status: 409,
      }),
    );
  });

  it("decodes typed workspace events and sends the cursor", async () => {
    const controller = new AbortController();
    let requestInit: RequestInit | undefined;
    const gateway = createWorkspaceEventsGateway(async (_input, init) => {
      requestInit = init;
      return new Response(
        ": connected\n\n" +
          'id: 8\nevent: source-change\ndata: {"type":"source-change","change":{"type":"file-changed","file":"main.ts","change":"modified"}}\n\n' +
          'id: 9\nevent: active-executions\ndata: {"type":"active-executions","executions":[]}\n\n',
        { headers: { "content-type": "text/event-stream" } },
      );
    });
    const iterator = gateway
      .subscribe(controller.signal, 7)
      [Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        id: 8,
        event: {
          type: "source-change",
          change: { type: "file-changed", file: "main.ts", change: "modified" },
        },
      },
    });
    controller.abort();
    await iterator.return?.();
    expect(new Headers(requestInit?.headers).get("Last-Event-ID")).toBe("7");
  });

  it("accepts only validated saved scopes and clears malformed local storage", () => {
    const values = new Map<string, string>([
      ["workspace", JSON.stringify({ file: "main.ts" })],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const local = createLocalStorageWorkspacePreferences(storage, "workspace");
    expect(local.load()).toBeUndefined();
    expect(values.has("workspace")).toBe(false);

    const memory = createMemoryWorkspacePreferences({
      ...scope,
      importsVisible: true,
    });
    expect(memory.load()).toEqual({ ...scope, importsVisible: true });
  });
});
