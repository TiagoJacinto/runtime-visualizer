#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { dirname, resolve } from "node:path";
import { ensureDir } from "./utils";
import { initializeSchema } from "./tracer";

const dbPath = resolve(process.argv[2] || "adws/adw_data/sssf.db");
ensureDir(dirname(dbPath));
const db = new Database(dbPath);
try {
  initializeSchema(db);
} finally {
  db.close();
}
