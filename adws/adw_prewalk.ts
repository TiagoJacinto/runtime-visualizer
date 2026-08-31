#!/usr/bin/env bun
import { main, input } from "./adw_modules/cli";
import * as workflow from "./adw_modules/workflows";

main(
  () => {},
  (program) => input(program),
  (x) => workflow.prewalk(x),
);
