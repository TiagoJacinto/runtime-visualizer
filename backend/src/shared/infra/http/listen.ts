interface ListenableServer {
  listen: (options: { host: string; port: number }) => Promise<string>;
}

export interface ListenWithPortFallbackOptions {
  readonly host: string;
  readonly port: number;
}

interface AddressInUseError extends Error {
  readonly code: "EADDRINUSE";
}

const isAddressInUseError = (error: unknown): error is AddressInUseError =>
  error instanceof Error && "code" in error && error.code === "EADDRINUSE";

/** Starts the server on the requested port or the next available port. */
export const listenWithPortFallback = async (
  app: ListenableServer,
  options: ListenWithPortFallbackOptions
): Promise<{ address: string; port: number }> => {
  const { host, port: initialPort } = options;
  for (let port = initialPort; port <= 65_535; port += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop, prefer-destructuring -- ports are tried sequentially and listen needs its server receiver.
      const address = await app.listen({ host, port });
      return { address, port };
    } catch (error) {
      if (!isAddressInUseError(error) || port === 65_535) {
        throw error;
      }
    }
  }

  throw new Error("No available port found.");
};
