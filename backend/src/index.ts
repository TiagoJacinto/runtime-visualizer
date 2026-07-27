import { createApp } from "./app.ts";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

if (!Number.isFinite(PORT) || PORT <= 0 || PORT > 65535) {
	throw new Error(`Invalid PORT: ${process.env.PORT ?? ""}`);
}

const app = await createApp();

await app.listen({ port: PORT, host: HOST });
console.log(`[server] listening on http://${HOST}:${PORT}`);

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
	console.log(`[server] received ${signal}, shutting down`);
	try {
		await app.close();
	} catch (err) {
		console.error("[server] error during shutdown:", err);
		process.exit(1);
	}
	process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, (s) => {
		void shutdown(s);
	});
}
