import { Command } from "commander";
import { resolvePrompt } from "./utils";

export type ConfigureCli = (program: Command) => void;
export type ParseCliInput<T> = (program: Command) => T;

export function args(
  configure: ConfigureCli = () => {},
  argv: readonly string[] = process.argv.slice(2),
) {
  const program = new Command();

  program
    .name("adw")
    .argument("[prompt]")
    .option("--config <path>", "configuration file")
    .option("--adw-id <id>", "ADW session identifier")
    .allowExcessArguments(false)
    .exitOverride();
  configure(program);
  program.parse(["node", "adw", ...argv]);

  return {
    program,
    positional: program.args as string[],
    options: program.opts() as Record<string, string | boolean>,
  };
}

export function input(program: Command) {
  const prompt = program.args[0];
  if (!prompt) throw new Error("prompt is required");

  const options = program.opts<{ config?: string; adwId?: string }>();
  return {
    prompt: resolvePrompt(prompt),
    config: options.config || "adws/adw_sssf_config/sssf.config.yaml",
    adwId: options.adwId,
  };
}

export async function main<T>(
  configure: ConfigureCli,
  parse: ParseCliInput<T>,
  fn: (value: T) => Promise<number>,
) {
  try {
    const parsed = args(configure);
    process.exitCode = await fn(parse(parsed.program));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "commander.helpDisplayed"
    ) {
      process.exitCode = 0;
      return;
    }
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
