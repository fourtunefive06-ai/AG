#!/usr/bin/env node
/* Checks the Postgres (Neon) database in .env step by step: connection string, reachable, signed in, tables, views.
   Run on the server:  node tools/pg-check.js            (read-only: reports what's there and what's missing)
                       node tools/pg-check.js --apply    (also creates missing tables and (re)creates the reporting views;
                                                          never deletes or changes data)
                       node tools/pg-check.js --print    (prints the Postgres view SQL generated from db/schema.sql) */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon, sqliteViewsToPg } = require("../lib/pg.js");
const { COLLECTIONS } = require("../lib/core.js");
const SCHEMA_FILE = path.join(ROOT, "db", "schema.sql");
const views = sqliteViewsToPg(fs.readFileSync(SCHEMA_FILE, "utf8"));
if (process.argv.includes("--print")) { console.log(views.join(";\n\n") + ";"); process.exit(0); }

const hint = msg => {
  if (/unreachable|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(msg)) return "The server can't reach Neon. Check the host in DATABASE_URL and that outgoing HTTPS (port 443) is allowed.";
  if (/password authentication|28P01|authentication/i.test(msg)) return "Wrong user or password in DATABASE_URL. Copy the connection string again from the Neon console (Connection details).";
  if (/does not exist|3D000/i.test(msg)) return "That database name doesn't exist. Check the part after the last / in DATABASE_URL.";
  if (/permission denied|42501/i.test(msg)) return "This database user can't create tables. Use the owner role from the Neon console.";
  if (/suspended|compute/i.test(msg)) return "The Neon compute may be suspended or out of quota. Check the project in the Neon console.";
  return "Send this message to your developer or Neon support.";
};
(async () => {
  const url = (process.env.DATABASE_URL || "").trim(), schema = (process.env.DATABASE_SCHEMA || process.env.DB_SCHEMA || "public").trim(), apply = process.argv.includes("--apply");
  if (!url) { console.log("DATABASE_URL is empty: the server uses the SQLite file", process.env.DB_FILE || "./db/crm.db"); process.exit(0); }
  let sql;
  try { sql = neon(url); console.log("✔ Connection string looks right · host", sql.host, "· schema", schema); }
  catch (e) { console.error("✖", e.message); process.exit(1); }
  try { const [r] = await sql.query("SELECT current_database() AS db, current_user AS usr, version() AS v"); console.log("✔ Signed in to database", r.db, "as", r.usr, "·", r.v.split(" ").slice(0, 2).join(" ")); }
  catch (e) { console.error("✖", e.message, "\n ", hint(e.message)); process.exit(1); }
  const have = new Set((await sql.query("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1", [schema])).map(r => r.table_name));
  const missingT = COLLECTIONS.filter(c => !have.has(c));
  const wantViews = views.map(v => (v.match(/^CREATE VIEW (\w+)/) || [])[1]).filter(Boolean), missingV = wantViews.filter(v => !have.has(v));
  console.log(`${missingT.length ? "!" : "✔"} Tables: ${COLLECTIONS.length - missingT.length}/${COLLECTIONS.length}${missingT.length ? " · missing: " + missingT.join(", ") : ""}`);
  console.log(`${missingV.length ? "!" : "✔"} Reporting views: ${wantViews.length - missingV.length}/${wantViews.length}${missingV.length ? " · missing: " + missingV.join(", ") : ""}`);
  if (apply) {
    try {
      const T = c => `"${schema}"."${c}"`, q = [];
      if (schema !== "public") q.push({ query: `CREATE SCHEMA IF NOT EXISTS "${schema}"` });
      COLLECTIONS.forEach(c => q.push({ query: `CREATE TABLE IF NOT EXISTS ${T(c)} (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())` }));
      await sql.batch(q);
      await sql.batch([{ query: `SET LOCAL search_path TO "${schema}"` }].concat(views.map(v => ({ query: v }))));
      console.log("✔ Tables and reporting views are in place (existing data untouched)");
    } catch (e) { console.error("✖ Applying the schema failed:", e.message, "\n ", hint(e.message)); process.exit(1); }
  } else if (missingT.length || missingV.length) console.log("  The server creates these at start. To create them now: node tools/pg-check.js --apply");
  const counts = await sql.batch(COLLECTIONS.filter(c => apply || have.has(c)).map(c => ({ query: `SELECT '${c}' AS c, count(*) AS n FROM "${schema}"."${c}"` })));
  console.log("  Rows:", counts.map(r => r[0].c + " " + r[0].n).join(" · "));
  const journal = path.resolve(ROOT, process.env.DATABASE_JOURNAL || "db/pg-journal.jsonl");
  const waiting = fs.existsSync(journal) ? fs.readFileSync(journal, "utf8").split("\n").filter(Boolean).length : 0;
  console.log(waiting ? `! ${waiting} change(s) in ${path.relative(ROOT, journal)} haven't reached the database yet. They're sent when the server starts.` : "✔ No unsent changes in the local journal");
})();
