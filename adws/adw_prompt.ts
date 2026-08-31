#!/usr/bin/env bun
import { main, input } from "./adw_modules/cli";
import * as workflow from "./adw_modules/workflows";

main(
  (program) => program.option("--agent <name>", "agent name", "builder"),
  (program) => {
    const options = program.opts<{ agent?: string }>();
    return { ...input(program), agent: options.agent ?? "builder" };
  },
  (x) => workflow.prompt(x),
);
