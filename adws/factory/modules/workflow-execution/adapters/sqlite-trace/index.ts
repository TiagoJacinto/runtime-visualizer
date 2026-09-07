import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { TraceEvent, TraceSinkPort } from "../../ports/trace-sink";

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/** Persistent SQLite trace sink backed by the operator's sqlite3 executable. */
export class SqliteTraceSink implements TraceSinkPort {
  private readonly path: string;
  private order = 0;

  constructor(path: string) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    if (
      existsSync(path) &&
      readFileSync(path).subarray(0, 16).toString() !== "SQLite format 3\\u0000"
    )
      rmSync(path, { force: true });
    execFileSync("sqlite3", [path], {
      input:
        "CREATE TABLE IF NOT EXISTS workflow_trace (run_identifier TEXT NOT NULL, event_order INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (run_identifier, event_order));\n",
      encoding: "utf8",
      stdio: ["pipe", "ignore", "pipe"],
    });
  }

  record(event: TraceEvent): void {
    this.order += 1;
    execFileSync("sqlite3", [this.path], {
      input: `INSERT INTO workflow_trace(run_identifier,event_order,payload_json) VALUES(${sqlString(event.runIdentifier)},${this.order},${sqlString(JSON.stringify(event))});\n`,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "pipe"],
    });
  }

  project(runIdentifier: string): readonly TraceEvent[] {
    try {
      const output = execFileSync(
        "sqlite3",
        [
          "-batch",
          "-noheader",
          this.path,
          `SELECT payload_json FROM workflow_trace WHERE run_identifier=${sqlString(runIdentifier)} ORDER BY event_order;`,
        ],
        { encoding: "utf8" },
      );
      const events: TraceEvent[] = [];
      for (const line of output.trim().split("\n")) {
        if (line) {
          try {
            events.push(JSON.parse(line) as TraceEvent);
          } catch (error) {
            throw new Error(`invalid event JSON: ${String(error)}`);
          }
        }
      }
      return events;
    } catch (error) {
      throw new Error(
        `cannot project SQLite trace for ${runIdentifier}: ${String(error)}`,
      );
    }
  }
}
