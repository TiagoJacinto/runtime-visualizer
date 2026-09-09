import type { FastifyPluginAsync } from "fastify";

import { listSourceFiles } from "./list-files.ts";

export interface FilesRoutesOptions {
  /**
   * Absolute path to the folder whose files should be listed.
   * Resolved by the caller (settings loader or test override).
   */
  readonly filesFolder: string;
}

const filesRoutes: FastifyPluginAsync<FilesRoutesOptions> = (app, options) => {
  const folder = options.filesFolder;

  app.get("/", (): Promise<string[]> => listSourceFiles(folder));
  return Promise.resolve();
};

export default filesRoutes;
