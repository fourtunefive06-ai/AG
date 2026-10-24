/**
 * Load existing CRM data into the Postgres database in DATABASE_URL.
 * Source: a full CRM backup (Settings → Backup in the CRM, or the prototype), or an old SQLite database file.
 *
 *   node tools/import-backup.js absel-crm-backup.json            → into DATABASE_URL from .env (must be empty)
 *   node tools/import-backup.js db/crm.db                        → copy an old SQLite database (needs Node 22.13+)
 *   node tools/import-backup.js absel-crm-backup.json --replace  → wipe the Postgres data first
 *
 * Users keep their passwords (same PBKDF2 format in prototype and server). Stop the server before importing.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch {}
const { openStore, COLLECTIONS } = require("../lib/store-postgres.js");

const file = process.argv[2];
if (!file) { console.error("Usage: node tools/import-backup.js <backup.json | crm.db> [--replace]"); process.exit(1); }

function readSource() {
  if (/\.json$/i.test(file)) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (data.format !== "absel-crm-backup" || !data.collections) { console.error("✖ That file is not an Absel CRM backup."); process.exit(1); }
    return data;
  }
  // Old SQLite database: one table per collection, (id, data JSON)
  process.removeAllListeners("warning");
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
  const collections = {};
  for (const c of COLLECTIONS) if (tables.has(c)) collections[c] = db.prepare(`SELECT data FROM ${c}`).all().map(r => JSON.parse(r.data));
  db.close();
  return { exported_at: fs.statSync(file).mtime.toISOString() + " (SQLite file)", collections };
}

(async () => {
  const data = readSource();
  const store = openStore(process.env.DATABASE_URL, path.join(ROOT, "db", "schema.sql"));
  await store.open();
  if (process.argv.includes("--replace")) {
    for (const c of COLLECTIONS) await store.pool.query(`TRUNCATE ${c}`);
    console.log("Previous Postgres data removed");
  } else if (store.all("leads").length || store.all("users").length) { console.error("✖ The database already has data. Run with --replace to overwrite it."); process.exit(1); }

  let total = 0;
  store.transaction(() => {
    for (const c of COLLECTIONS) for (const o of data.collections[c] || []) { if (!o || !o.id) continue; if (c === "users") o.session_ver = (o.session_ver || 0) + 1; store.put(c, o); total++; }
  });
  await store.close();
  const users = data.collections.users || [];
  console.log(`✔ Imported ${total} records into Postgres`);
  console.log(`  ${(data.collections.leads || []).length} leads · ${users.length} users (${users.filter(u => u.password_hash).length} with passwords) · exported ${data.exported_at}`);
  if (users.some(u => u.sample)) console.log("  Note: this backup contains sample users and leads from the prototype. Remove them in Team and Leads before going live.");
})().catch(e => { console.error("✖ " + e.message); process.exit(1); });
