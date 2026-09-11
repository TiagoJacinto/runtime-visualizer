import { once } from "node:events";
import net from "node:net";

import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { listenWithPortFallback } from "../../../src/shared/index.ts";

const servers: net.Server[] = [];

const reservePort = async (): Promise<number> => {
  const server = net.createServer();
  servers.push(server);
  server.listen({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  if (address === null) {
    throw new Error("Expected the reserved server to have an address");
  }
  // SAFETY: A TCP server started with host and port options returns AddressInfo.
  return (address as net.AddressInfo).port;
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    })
  );
});

describe("listenWithPortFallback", () => {
  it("uses the next available port when the requested port is occupied", async () => {
    const occupiedPort = await reservePort();
    const app = Fastify();
    app.get("/health", () => ({ status: "ok" }));

    const listening = await listenWithPortFallback(app, {
      host: "127.0.0.1",
      port: occupiedPort,
    });

    try {
      expect(listening.port).toBe(occupiedPort + 1);
      expect(new URL(listening.address).port).toBe(String(occupiedPort + 1));
      const response = await fetch(`${listening.address}/health`);
      expect(response.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("rethrows errors other than an occupied port", async () => {
    const app = {
      listen: () => Promise.reject(new Error("startup failed")),
    };

    await expect(
      listenWithPortFallback(app, { host: "127.0.0.1", port: 3000 })
    ).rejects.toThrow("startup failed");
  });
});
