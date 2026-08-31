#!/usr/bin/env bun
import { main, input } from "./adw_modules/cli";
import * as workflow from "./adw_modules/workflows";

main(
  () => {},
  input,
  (x) => workflow.build(x),
);
