import type { FastifyPluginCallback } from "fastify";
import { z } from "zod";

import {
  isSourceFile,
  listSourceFiles,
  readSource,
} from "../../../source/index.ts";
import { analyseProject } from "./project-analyzer.ts";

const requestSchema = z.object({
  filePath: z.string().optional(),
  files: z.record(z.string(), z.string()).optional(),
  functionName: z
    .string()
    .regex(
      /^[A-Za-z_$][A-Za-z0-9_$]*$/u,
      "Function name must be a valid identifier."
    )
    .optional(),
  showImports: z.boolean().optional(),
  source: z.string().max(1_000_000),
});

const resourceQuery = z.object({
  file: z.string().min(1).optional(),
  name: z
    .string()
    .regex(
      /^[A-Za-z_$][A-Za-z0-9_$]*$/u,
      "Procedure name must be a valid identifier."
    )
    .optional(),
  showImports: z
    .stringbool({ falsy: ["false", "0"], truthy: ["true", "1"] })
    .optional(),
});

interface CfgRoutesOptions {
  readonly filesFolder: string;
}

const cfgRoutes: FastifyPluginCallback<CfgRoutesOptions> = (
  app,
  options,
  done
) => {
  app.get("/", async (req, reply) => {
    const parsedQuery = resourceQuery.safeParse(req.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({
        error: parsedQuery.error.issues[0]?.message ?? "Invalid request query.",
      });
    }
    if (parsedQuery.data.file === undefined) {
      return {
        info: "POST { source: string, filePath?: string, functionName?: string, showImports?: boolean, files?: Record<string, string> } to build a control-flow graph.",
        ok: true,
      };
    }
    const resource = await readSource(
      options.filesFolder,
      parsedQuery.data.file
    );
    const listedFiles = await listSourceFiles(options.filesFolder);
    const sourceFiles = listedFiles.filter(isSourceFile);
    const workerCount = Math.min(8, sourceFiles.length);
    const workerFiles = Array.from(
      { length: workerCount },
      (_unusedIndex, worker) =>
        sourceFiles.filter(
          (_sourceFile, index) => index % workerCount === worker
        )
    );
    const readEntry = async (
      file: string
    ): Promise<readonly [string, string]> => {
      const sourceResource = await readSource(options.filesFolder, file);
      return [file, sourceResource.source];
    };
    const groupedEntries = await Promise.all(
      workerFiles.map((filesInWorker) =>
        Promise.all(filesInWorker.map((file) => readEntry(file)))
      )
    );
    const files = Object.fromEntries(groupedEntries.flat());
    const analysis = analyseProject({
      filePath: resource.file,
      files,
      functionName: parsedQuery.data.name,
      showImports: parsedQuery.data.showImports,
      source: resource.source,
    });
    if (analysis.diagnostics.length > 0) {
      return reply.code(422).send({
        diagnostics: analysis.diagnostics,
        file: resource.file,
        ok: false,
        revision: resource.revision,
      });
    }
    const procedure = analysis.cfg?.procedures?.[0];
    if (procedure === undefined) {
      return reply.code(422).send({ error: "No executable Procedure found." });
    }
    return {
      cfg: analysis.cfg,
      file: resource.file,
      ok: true,
      revision: resource.revision,
    };
  });

  app.post("/", (req, reply) => {
    const parsed = requestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const status = issue?.code === "too_big" ? 413 : 400;
      return reply
        .code(status)
        .send({ error: issue?.message ?? "Invalid request body." });
    }
    const { source, filePath, functionName, showImports, files } = parsed.data;
    const analysis = analyseProject({
      filePath: filePath ?? "inline.ts",
      files,
      functionName,
      showImports,
      source,
    });
    if (analysis.diagnostics.length > 0) {
      return reply
        .code(422)
        .send({ diagnostics: analysis.diagnostics, ok: false });
    }
    return { cfg: analysis.cfg, ok: true };
  });
  done();
};

export default cfgRoutes;
