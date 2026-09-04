#!/usr/bin/env bun
import { main, input } from "./adw_modules/cli";
import * as workflow from "./adw_modules/workflows";

main(
  (program) => program.option("--problem-folder <path>", "problem folder"),
  (program) => {
    const options = program.opts<{ problemFolder?: string }>();
    return { ...input(program), problemFolder: options.problemFolder };
  },
  (x) => workflow.research(x),
);
