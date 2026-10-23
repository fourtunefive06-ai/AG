/**
 * SQLite persistence for the CRM core.
 * Every record lives in its own table row (id + JSON). All records are loaded into memory at start;
 * every change is written through to disk immediately. Reporting views are defined in db/schema.sql.
 */
"use strict";
const fs = require("fs");
const path = require("path");
process.removeAllListeners("warning");
const { DatabaseSync } = require("node:sqlite");
const { createMemoryStore, COLLECTIONS } = require("./core.js");



function openStore(file, schemaFile) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  for (const c of COLLECTIONS) db.exec(`CREATE TABLE IF NOT EXISTS ${c} (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
  if (schemaFile && fs.existsSync(schemaFile)) db.exec(fs.readFileSync(schemaFile, "utf8"));
  const up = {}, del = {};
  for (const c of COLLECTIONS) {
    up[c] = db.prepare(`INSERT INTO ${c} (id, data, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
    del[c] = db.prepare(`DELETE FROM ${c} WHERE id = ?`);
  }
  const store = createMemoryStore((col, op, obj) => {
    if (!up[col]) throw new Error("Unknown collection " + col);
    if (op === "put") up[col].run(obj.id, JSON.stringify(obj)); else del[col].run(obj.id);
  });
  for (const c of COLLECTIONS) store.load(c, db.prepare(`SELECT data FROM ${c}`).all().map(r => JSON.parse(r.data)));
  let depth = 0;
  // Group many writes into one transaction (faster, and a request's writes land together)
  store.transaction = fn => {
    if (depth++ === 0) db.exec("BEGIN");
    try { return fn(); } finally { if (--depth === 0) db.exec("COMMIT"); }
  };
  store.db = db;
  return store;
}

module.exports = { openStore, COLLECTIONS };
