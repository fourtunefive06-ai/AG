/**
 * Postgres (Neon) persistence for the CRM core, used when DATABASE_URL is set.
 * Same layout as the SQLite store: one table per collection, each row = (id, data jsonb, updated_at).
 * All records are loaded into memory at start (the core is synchronous); every change is written to
 * a local journal first, then sent to Postgres in order, in one database transaction per request.
 * If the database can't be reached the journal keeps the changes and they're sent when it's back
 * (also after a restart). Reporting views come from db/schema.sql, translated to Postgres.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { neon, sqliteViewsToPg } = require("./pg.js");
const { createMemoryStore, COLLECTIONS } = require("./core.js");

const CHUNK_BYTES = 3 * 1024 * 1024;
// jsonb can't hold \u0000; drop it (an escaped backslash before it is kept)
const pgJson = obj => JSON.stringify(obj).replace(/(^|[^\\])((?:\\\\)*)\\u0000/g, "$1$2");

async function openStorePg(url, { schemaFile, schema = "public", journal, log = console } = {}) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("DATABASE_SCHEMA must be lower-case letters, digits and _");
  const sql = neon(url), T = c => `"${schema}"."${c}"`;
  // Tables for every collection (new collections appear automatically), then the reporting views
  const setup = [];
  if (schema !== "public") setup.push({ query: `CREATE SCHEMA IF NOT EXISTS "${schema}"` });
  for (const c of COLLECTIONS) setup.push({ query: `CREATE TABLE IF NOT EXISTS ${T(c)} (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())` });
  await sql.batch(setup);
  if (schemaFile && fs.existsSync(schemaFile)) await sql.batch([{ query: `SET LOCAL search_path TO "${schema}"` }].concat(sqliteViewsToPg(fs.readFileSync(schemaFile, "utf8")).map(q => ({ query: q }))));

  // Changes not yet confirmed by the database (from this run or a previous one)
  const queue = [];
  if (journal) {
    fs.mkdirSync(path.dirname(journal), { recursive: true });
    if (fs.existsSync(journal)) for (const line of fs.readFileSync(journal, "utf8").split("\n")) { if (!line) continue; try { queue.push(JSON.parse(line)); } catch (e) { /* torn last line after a crash */ } }
    if (queue.length) log.log(`  Database: sending ${queue.length} saved change(s) from the last run`);
  }
  const state = { pending: 0, last_error: null, last_error_at: null, last_ok_at: null, sent: 0 };
  const stmt = op => op.op === "put"
    ? { query: `INSERT INTO ${T(op.col)} (id, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, params: [op.id, op.data] }
    : { query: `DELETE FROM ${T(op.col)} WHERE id = $1`, params: [op.id] };
  let flushing = null, retryMs = 1000, timer = null;
  const waiters = [];
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      while (queue.length) {
        let n = 0, bytes = 0; while (n < queue.length && (n === 0 || bytes + (queue[n].data || "").length < CHUNK_BYTES)) { bytes += (queue[n].data || "").length; n++; }
        try { await sql.batch(queue.slice(0, n).map(stmt)); }
        catch (e) {
          state.last_error = e.message; state.last_error_at = new Date().toISOString();
          log.error(`Database write failed (${queue.length} change(s) kept, retrying in ${Math.round(retryMs / 1000)}s): ${e.message}`);
          clearTimeout(timer); timer = setTimeout(flush, retryMs); if (timer.unref) timer.unref(); retryMs = Math.min(retryMs * 2, 60000);
          return false;
        }
        queue.splice(0, n); state.sent += n; state.last_ok_at = new Date().toISOString(); state.last_error = null; retryMs = 1000;
      }
      if (journal) fs.writeFileSync(journal, "");
      return true;
    })().finally(() => { flushing = null; state.pending = queue.length; if (!queue.length) waiters.splice(0).forEach(w => w()); });
    return flushing;
  }
  // Collected during a transaction, then journaled and queued together
  let open = [];
  function commit() {
    if (!open.length) return;
    const ops = open; open = [];
    if (journal) fs.appendFileSync(journal, ops.map(o => JSON.stringify(o)).join("\n") + "\n");
    queue.push(...ops); state.pending = queue.length;
    flush();
  }
  let depth = 0;
  const store = createMemoryStore((col, op, obj) => {
    if (!COLLECTIONS.includes(col)) throw new Error("Unknown collection " + col);
    open.push(op === "put" ? { col, op, id: obj.id, data: pgJson(obj) } : { col, op, id: obj.id });
    if (depth === 0) commit(); // a write outside store.transaction()
  });
  if (queue.length && !(await flush())) throw new Error("Couldn't send the changes saved from the last run: " + state.last_error);
  const loaded = await sql.batch(COLLECTIONS.map(c => ({ query: `SELECT data::text AS data FROM ${T(c)}` })));
  COLLECTIONS.forEach((c, i) => store.load(c, loaded[i].map(r => JSON.parse(r.data))));
  // Group many writes into one database transaction (a request's writes land together)
  store.transaction = fn => {
    depth++;
    try { return fn(); } finally { if (--depth === 0) commit(); }
  };
  store.kind = "postgres";
  store.status = () => Object.assign({ kind: "postgres", host: sql.host, schema }, state, { pending: queue.length });
  // Resolves once everything written so far is in the database (or after timeoutMs)
  store.flush = (timeoutMs = 15000) => queue.length ? new Promise(res => { waiters.push(() => res(true)); flush(); setTimeout(() => res(false), timeoutMs).unref(); }) : Promise.resolve(true);
  store.sql = sql;
  return store;
}

module.exports = { openStorePg, COLLECTIONS };
