// Integration test for lib/store-pg.js against the Neon database in .env.
// Works in a throwaway schema (absel_test_<random>) that is dropped at the end: the live tables are never touched.
//   node tools/pg-store-test.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch {}
const { openStorePg } = require("../lib/store-pg.js");
const { neon, sqliteViewsToPg } = require("../lib/pg.js");
const { createCRM } = require("../lib/core.js");

// The view translation needs no database
{
  const v = sqliteViewsToPg("-- c\nDROP VIEW IF EXISTS v_x;\nCREATE VIEW v_x AS SELECT json_extract(a.data,'$.x.y') AS y, json_array_length(json_extract(a.data,'$.b')) AS n FROM t a;");
  assert.deepStrictEqual(v, ["DROP VIEW IF EXISTS v_x CASCADE", "CREATE VIEW v_x AS SELECT (a.data #>> '{x,y}') AS y, COALESCE(jsonb_array_length(a.data #> '{b}'), 0) AS n FROM t a"]);
}
const url = (process.env.DATABASE_URL || "").trim();
if (!url) { console.log("DATABASE_URL not set: skipped the Postgres store test (view translation ✔)"); process.exit(0); }

const schema = "absel_test_" + Math.random().toString(36).slice(2, 8), sql = neon(url);
const journal = path.join(os.tmpdir(), schema + ".jsonl");
const quiet = { log: () => {}, error: () => {} };
try {
  // 1. open: tables + views created, empty
  let s = await openStorePg(url, { schemaFile: path.join(ROOT, "db", "schema.sql"), schema, journal, log: quiet });
  assert.strictEqual(s.all("leads").length, 0);
  const views = (await sql.query("SELECT table_name FROM information_schema.views WHERE table_schema = $1", [schema])).map(r => r.table_name);
  assert(views.includes("v_payments") && views.includes("v_leads"), "views created");
  // 2. writes in a transaction land together; \u0000 and unicode survive
  s.transaction(() => { s.put("leads", { id: "L1", first_name: "Zoë", note: "a\u0000b", n: 3 }); s.put("leads", { id: "L2", first_name: "B" }); s.put("payments", { id: "P1", amount: 10.5, status: "completed", reference: "D-1" }); });
  s.put("users", { id: "U1", name: "outside a transaction" });
  assert(await s.flush(), "flushed");
  s.transaction(() => { s.remove("leads", "L2"); s.put("leads", Object.assign(s.get("leads", "L1"), { n: 4 })); });
  assert(await s.flush());
  assert.strictEqual(fs.readFileSync(journal, "utf8"), "", "journal emptied after the database confirmed");
  const [vp] = await sql.query(`SELECT reference, amount FROM "${schema}".v_payments`);
  assert.deepStrictEqual(vp, { reference: "D-1", amount: "10.5" }, "view reads the JSON");
  // 3. reopen: everything loads back
  s = await openStorePg(url, { schema, journal, log: quiet });
  assert.deepStrictEqual(s.all("leads").map(l => [l.id, l.first_name, l.n, l.note]), [["L1", "Zoë", 4, "ab"]]);
  assert.strictEqual(s.get("users", "U1").name, "outside a transaction");
  // 4. changes left in the journal by a crash are sent at the next start, in order
  fs.writeFileSync(journal, [{ col: "leads", op: "put", id: "L3", data: JSON.stringify({ id: "L3", v: 1 }) }, { col: "leads", op: "put", id: "L3", data: JSON.stringify({ id: "L3", v: 2 }) }, { col: "leads", op: "del", id: "L1" }].map(o => JSON.stringify(o)).join("\n") + "\n{\"torn");
  s = await openStorePg(url, { schema, journal, log: quiet });
  assert.deepStrictEqual(s.all("leads"), [{ id: "L3", v: 2 }], "journal replayed");
  // 5. the whole CRM runs on it
  const crm = createCRM({ store: s, hashPassword: p => "x:" + p });
  s.transaction(() => crm.ensureDefaults());
  assert(await s.flush());
  const [{ n }] = await sql.query(`SELECT count(*) AS n FROM "${schema}".templates`);
  assert(Number(n) > 10, "default templates saved");
  // 6. database unreachable: the change waits in the journal, nothing is lost
  const bad = await openStorePg(url, { schema, journal, log: quiet });
  bad.sql.batch = async () => { throw new Error("simulated outage"); };
  bad.put("leads", { id: "L9", v: 9 });
  await new Promise(r => setTimeout(r, 200));
  assert(bad.status().pending === 1 && /simulated outage/.test(bad.status().last_error), "kept while down");
  assert(fs.readFileSync(journal, "utf8").includes("L9"), "journaled");
  s = await openStorePg(url, { schema, journal, log: quiet });
  assert(s.get("leads", "L9"), "sent at the next start");
  console.log("✔ Postgres store: create, transactions, reload, journal replay, outage, CRM defaults");
} finally {
  await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  try { fs.unlinkSync(journal); } catch {}
}
