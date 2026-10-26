/**
 * PostgreSQL persistence for the CRM core (used when DATABASE_URL is set, e.g. Neon).
 * Same model as store-sqlite.js: every record is one row (id + JSONB). All records are loaded into memory
 * at start; changes are written to Postgres in the background, in order, grouped per transaction.
 * Reporting views are defined in db/schema-postgres.sql.
 *
 * Run only ONE server process per database: each process keeps its own copy of the data in memory.
 */
"use strict";
const fs = require("fs");
const { Pool } = require("pg");
const { createMemoryStore, COLLECTIONS } = require("./core.js");

const ident = s => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error("Invalid schema name " + s); return '"' + s + '"'; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function poolFor(url) {
  const u = new URL(url);
  // node-postgres treats sslmode=require as verify-full (and warns); say so explicitly to keep the logs clean
  if (u.searchParams.get("sslmode") === "require") u.searchParams.set("sslmode", "verify-full");
  const channelBinding = u.searchParams.get("channel_binding") === "require";
  u.searchParams.delete("channel_binding");
  const pool = new Pool({ connectionString: u.toString(), enableChannelBinding: channelBinding, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 20000 });
  pool.on("error", e => console.error("Postgres idle connection error:", e.message));
  return pool;
}

function openStore(url, schemaFile, schema = "public") {
  const pool = poolFor(url), S = ident(schema), T = c => `${S}.${c}`;
  let pending = new Map(), flushing = null, depth = 0, txOps = [], lastError = "";

  const enqueue = recs => { for (const r of recs) pending.set(r.col + "\0" + r.id, r); if (!flushing) flushing = flushLoop(); };
  const store = createMemoryStore((col, op, obj) => {
    if (!COLLECTIONS.includes(col)) throw new Error("Unknown collection " + col);
    // Snapshot now: the in-memory object can change again before it is written. JSONB can't hold \u0000, so drop it.
    const rec = { col, op, id: obj.id, data: op === "put" ? JSON.stringify(obj).replace(/(?<!\\)((?:\\\\)*)\\u0000/g, "$1") : null };
    if (depth) txOps.push(rec); else enqueue([rec]);
  });

  async function writeBatch(recs) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const col of new Set(recs.map(r => r.col))) {
        const puts = recs.filter(r => r.col === col && r.op === "put"), dels = recs.filter(r => r.col === col && r.op === "del");
        if (puts.length) await client.query(`INSERT INTO ${T(col)} (id, data, updated_at) SELECT id, data::jsonb, now() FROM unnest($1::text[], $2::text[]) AS t(id, data)
          ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`, [puts.map(r => r.id), puts.map(r => r.data)]);
        if (dels.length) await client.query(`DELETE FROM ${T(col)} WHERE id = ANY($1::text[])`, [dels.map(r => r.id)]);
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
    finally { client.release(); }
  }

  async function flushLoop() {
    let wait = 1000;
    while (pending.size) {
      const batch = [...pending.values()]; pending = new Map();
      try { await writeBatch(batch); wait = 1000; lastError = ""; continue; }
      catch (e) {
        // Bad data (SQLSTATE class 22/23) never succeeds on retry: write the rows one by one and drop only the bad ones
        if (/^2[23]/.test(e.code || "")) {
          for (const r of batch) {
            try { await writeBatch([r]); }
            catch (e2) { if (/^2[23]/.test(e2.code || "")) console.error(`✖ Postgres rejected ${r.col}/${r.id}: ${e2.message}`); else { requeue([r]); break; } }
          }
          continue;
        }
        if (e.message !== lastError) console.error("✖ Postgres write failed, retrying:", e.message);
        lastError = e.message; requeue(batch);
        await sleep(wait); wait = Math.min(wait * 2, 30000);
      }
    }
    flushing = null;
  }
  // Newer changes to the same record (queued while this batch was in flight) win
  function requeue(recs) { for (const r of recs) { const k = r.col + "\0" + r.id; if (!pending.has(k)) pending.set(k, r); } }

  // Group many writes into one transaction (a request's writes land together)
  store.transaction = fn => {
    if (depth++ === 0) txOps = [];
    try { return fn(); } finally { if (--depth === 0) { const ops = txOps; txOps = []; if (ops.length) enqueue(ops); } }
  };
  store.flush = async () => { while (flushing) await flushing; };
  store.close = async () => { await store.flush(); await pool.end(); };
  store.pending = () => pending.size + (flushing ? 1 : 0); // queued or being written
  store.pool = pool;
  store.label = `PostgreSQL ${new URL(url).hostname}${schema === "public" ? "" : " (schema " + schema + ")"}`;

  // Tables + views in one round trip (one transaction), then every row in one query: the database may be far away
  store.ready = (async () => {
    const ddl = [`CREATE SCHEMA IF NOT EXISTS ${S}`, `SET LOCAL search_path TO ${S}`,
      ...COLLECTIONS.map(c => `CREATE TABLE IF NOT EXISTS ${T(c)} (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`),
      schemaFile && fs.existsSync(schemaFile) ? fs.readFileSync(schemaFile, "utf8") : ""];
    const client = await pool.connect();
    try { await client.query("BEGIN;\n" + ddl.join(";\n") + ";\nCOMMIT;"); client.release(); }
    catch (e) { await client.query("ROLLBACK").catch(() => {}); client.release(true); throw e; }
    const { rows } = await pool.query(COLLECTIONS.map(c => `SELECT '${c}' AS c, data FROM ${T(c)}`).join(" UNION ALL "));
    const by = Object.fromEntries(COLLECTIONS.map(c => [c, []]));
    for (const r of rows) by[r.c].push(r.data);
    for (const c of COLLECTIONS) store.load(c, by[c]);
    return store;
  })();
  return store;
}

module.exports = { openStore, COLLECTIONS };
