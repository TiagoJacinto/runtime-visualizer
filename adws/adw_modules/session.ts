import { resolve } from "node:path";
import { SSSFConfig } from "./data_types";
import { Tracer } from "./tracer";
import { Run } from "./runner";
import { engineerName, newId, redactSecrets } from "./utils";
import { basename } from "node:path";

export function ensure(cfg: SSSFConfig, adwId?: string, expectedSourceRevision?: string) {
  const id = adwId || newId(8);
  const dataDir = resolve(cfg.defaults.data_dir);
  const tracer = new Tracer(
    resolve(cfg.observability.db),
    resolve(dataDir, "sessions", id, "events.jsonl"),
  );
  const run = new Run(cfg, id, tracer, engineerName());
  tracer.sessionStart(id, run.engineer, basename(process.argv[1] || "adw"));
  try {
    run.prepareWorkspace(expectedSourceRevision);
  } catch (error) {
    const reason = redactSecrets(String(error));
    tracer.event({
      adw_id: id,
      type: "error",
      name: "source_preflight",
      payload: { error: reason },
    });
    run.fail(reason);
    throw error;
  }
  tracer.processStart(id, "adw", "", process.pid, process.argv.join(" "));
  process.once("SIGTERM", () => {
    run.abort("canceled");
    run.fail("canceled");
    process.exit(128 + 15);
  });
  process.once("SIGINT", () => {
    run.abort("canceled");
    run.fail("canceled");
    process.exit(128 + 2);
  });
  run.console.sessionStarted(id, run.engineer);
  return run;
}
