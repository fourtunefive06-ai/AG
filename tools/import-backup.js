/**
 * Load a full CRM backup (Settings → Backup in the CRM, or the prototype) into the server database.
 *
 *   node tools/import-backup.js absel-crm-backup.json            → into DB_FILE from .env (must be empty)
 *   node tools/import-backup.js absel-crm-backup.json --replace  → wipe the database first (keeps a copy as .before-import)
 *
 * Users keep their passwords (same PBKDF2 format in prototype and server). Stop the server before importing.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch {}
const { COLLECTIONS } = require("../lib/core.js");

const file = process.argv[2];
if (!file) { console.error("Usage: node tools/import-backup.js <backup.json> [--replace]"); process.exit(1); }
const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (data.format !== "absel-crm-backup" || !data.collections) { console.error("✖ That file is not an Absel CRM backup."); process.exit(1); }

const dbUrl = (process.env.DATABASE_URL || "").trim(), schema = (process.env.DB_SCHEMA || "public").trim();
const dbFile = path.resolve(ROOT, process.env.DB_FILE || "db/crm.db");
const replace = process.argv.includes("--replace");

(async () => {
  let store, target;
  if (dbUrl) {
    // PostgreSQL: --replace empties the CRM tables (make a Neon branch or backup first if you need the old data)
    store = require("../lib/store-postgres.js").openStore(dbUrl, path.join(ROOT, "db", "schema-postgres.sql"), schema);
    await store.ready;
    target = store.label;
    if (replace) {
      await store.pool.query(`TRUNCATE ${COLLECTIONS.map(c => `"${schema}".${c}`).join(", ")}`);
      for (const c of COLLECTIONS) for (const o of store.all(c)) store.remove(c, o.id, true);
      console.log("Emptied the existing CRM tables in", target);
    }
  } else {
    if (replace && fs.existsSync(dbFile)) {
      fs.copyFileSync(dbFile, dbFile + ".before-import");
      for (const ext of ["", "-wal", "-shm"]) { try { fs.unlinkSync(dbFile + ext); } catch {} }
      console.log("Previous database saved as", dbFile + ".before-import");
    }
    store = require("../lib/store-sqlite.js").openStore(dbFile, path.join(ROOT, "db", "schema.sql"));
    target = dbFile;
  }
  if (store.all("leads").length || store.all("users").length) { console.error("✖ The database already has data. Run with --replace to overwrite it."); process.exit(1); }

  let total = 0;
  store.transaction(() => {
    for (const c of COLLECTIONS) for (const o of data.collections[c] || []) { if (!o || !o.id) continue; if (c === "users") o.session_ver = (o.session_ver || 0) + 1; store.put(c, o); total++; }
  });
  if (store.close) await store.close();
  const users = store.all("users");
  console.log(`✔ Imported ${total} records into ${target}`);
  console.log(`  ${store.all("leads").length} leads · ${users.length} users (${users.filter(u => u.password_hash).length} with passwords) · exported ${data.exported_at}`);
  if (users.some(u => u.sample)) console.log("  Note: this backup contains sample users and leads from the prototype. Remove them in Team and Leads before going live.");
})().catch(e => { console.error("✖ " + e.message); process.exit(1); });
