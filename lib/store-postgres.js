/**
 * PostgreSQL persistence for the CRM core (works with Neon, Render Postgres, Supabase or any Postgres 13+).
 * Every record lives in its own table row (id + JSONB). All records are loaded into memory at start;
 * changes are written through in the background, one Postgres transaction per CRM transaction.
 * server.js waits for pending writes (store.flush) before it answers a request, so a client never sees
 * "saved" for something that isn't in the database yet. Reporting views are defined in db/schema.sql.
 */
"use strict";
const fs = require("fs");
const { Pool } = require("pg");
const { createMemoryStore, COLLECTIONS } = require("./core.js");

// Postgres rejects \u0000 inside JSONB strings; drop it rather than fail the whole write
const toJson = o => JSON.stringify(o, (k, v) => typeof v === "string" && v.includes("\0") ? v.replace(/\0/g, "") : v);
const isDataError = e => /^(22|23|42)/.test(e && e.code || ""); // bad value / constraint / SQL: retrying won't help

function openStore(url, schemaFile) {
  if (!url) throw new Error("DATABASE_URL is not set. Add your Postgres connection string (e.g. from Neon) to .env or the host's environment.");
  const pool = new Pool({ connectionString: url, max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 30000, keepAlive: true });
  pool.on("error", e => console.error("postgres (idle connection):", e.message)); // Neon closes idle connections; the pool reconnects

  let pending = new Map(); // "collection\0id" -> { col, id, obj|null }
  const persist = (col, op, obj) => {
    if (!COLLECTIONS.includes(col)) throw new Error("Unknown collection " + col);
    pending.set(col + "\0" + obj.id, { col, id: obj.id, obj: op === "put" ? obj : null });
    if (!depth) schedule();
  };
  const store = createMemoryStore(persist);
  let depth = 0, timer = null, chain = Promise.resolve(), retryMs = 0;

  // Group many writes into one transaction (a request's writes land together)
  store.transaction = fn => {
    depth++;
    try { return fn(); } finally { if (--depth === 0 && pending.size) schedule(); }
  };
  function schedule() { if (!timer) timer = setTimeout(run, retryMs); }
  function run() { timer = null; chain = chain.then(writeBatch).catch(e => console.error("postgres:", e)); return chain; }

  async function writeBatch() {
    if (!pending.size) return;
    const batch = pending; pending = new Map();
    const byCol = {};
    for (const { col, id, obj } of batch.values()) {
      const b = byCol[col] || (byCol[col] = { ids: [], data: [], del: [] });
      if (obj) { b.ids.push(id); b.data.push(toJson(obj)); } else b.del.push(id);
    }
    try {
      await inTransaction(async q => { for (const [col, b] of Object.entries(byCol)) await writeCol(q, col, b); });
      retryMs = 0;
    } catch (e) {
      if (isDataError(e)) return writeOneByOne(batch, e);
      // Connection problem (e.g. Neon waking up): put the batch back under anything newer and retry
      for (const [k, v] of batch) if (!pending.has(k)) pending.set(k, v);
      retryMs = Math.min(30000, (retryMs || 1000) * 2);
      console.error(`postgres: write failed (${e.message || e.code || e}); ${pending.size} change(s) kept in memory, retrying in ${retryMs / 1000}s`);
      schedule();
    }
  }
  async function writeCol(q, col, b) {
    if (b.ids.length) await q(`INSERT INTO ${col} (id, data, updated_at) SELECT id, data::jsonb, now() FROM unnest($1::text[], $2::text[]) AS t(id, data)
      ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, [b.ids, b.data]);
    if (b.del.length) await q(`DELETE FROM ${col} WHERE id = ANY($1::text[])`, [b.del]);
  }
  // One bad record must not block every other write: save the rest and log the one that failed
  async function writeOneByOne(batch, first) {
    console.error("postgres: batch rejected (" + first.message + "); saving records one at a time");
    for (const { col, id, obj } of batch.values()) {
      try { await writeCol((s, p) => pool.query(s, p), col, obj ? { ids: [id], data: [toJson(obj)], del: [] } : { ids: [], data: [], del: [id] }); }
      catch (e) {
        if (isDataError(e)) { console.error(`postgres: could not save ${col}/${id}: ${e.message}`); continue; }
        const k = col + "\0" + id; if (!pending.has(k)) pending.set(k, { col, id, obj });
        retryMs = Math.max(retryMs, 2000); schedule();
      }
    }
  }
  async function inTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await fn((s, p) => client.query(s, p));
      await client.query("COMMIT");
      client.release();
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      client.release(e);
      throw e;
    }
  }

  // Connect, create tables and views, and load every record into memory
  store.open = async () => {
    for (const c of COLLECTIONS) await pool.query(`CREATE TABLE IF NOT EXISTS ${c} (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    if (schemaFile && fs.existsSync(schemaFile)) await pool.query(fs.readFileSync(schemaFile, "utf8"));
    for (const c of COLLECTIONS) store.load(c, (await pool.query(`SELECT data FROM ${c}`)).rows.map(r => r.data));
    return store;
  };
  // Resolves once every change made so far has been written (or has failed one attempt and is queued for retry)
  store.flush = () => { if (pending.size && !depth) { clearTimeout(timer); timer = null; if (!retryMs) return run(); } return chain; };
  store.pending = () => pending.size;
  store.close = async () => { for (let i = 0; i < 20 && pending.size; i++) { await store.flush(); if (pending.size) await new Promise(r => setTimeout(r, 500)); } await chain; await pool.end(); };
  store.pool = pool;
  return store;
}

module.exports = { openStore, COLLECTIONS };
