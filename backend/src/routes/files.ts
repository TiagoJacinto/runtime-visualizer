import type { FastifyPluginAsync } from "fastify";
import { listSourceFiles } from "../source/source-files.ts";

export { isSourceFile, walk } from "../source/source-files.ts";

export type FilesRoutesOptions = {
	/**
	 * Absolute path to the folder whose files should be listed.
	 * Resolved by the caller (settings loader or test override).
	 */
	readonly filesFolder: string;
};

const filesRoutes: FastifyPluginAsync<FilesRoutesOptions> = async (
	app,
	options,
) => {
	const folder = options.filesFolder;

	app.get("/", async (): Promise<string[]> => listSourceFiles(folder));
};

export default filesRoutes;
