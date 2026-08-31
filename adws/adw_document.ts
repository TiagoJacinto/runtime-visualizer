#!/usr/bin/env bun
import { main, input } from "./adw_modules/cli";
import * as workflow from "./adw_modules/workflows";

main(
  (program) => program.option("--base <branch>", "base branch", "main"),
  (program) => {
    const options = program.opts<{ base?: string }>();
    return { ...input(program), base: options.base ?? "main" };
  },
  (x) => workflow.document(x),
);
