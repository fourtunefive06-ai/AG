/* Neon Postgres over HTTPS (Neon's SQL-over-HTTP endpoint), with no driver package.
   - DATABASE_URL is the normal connection string from the Neon console (postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require)
   - every call is one HTTPS request; a batch runs as one transaction (all statements commit or none do)
   - values come back as text (JSON columns are read with ::text and parsed by the caller)
   The connection string is a secret: it's only sent to the database host and never logged. */
"use strict";

function neon(url, { timeoutMs = 30000 } = {}) {
  let u; try { u = new URL(String(url || "")); } catch (e) { throw new Error("DATABASE_URL is not a valid connection string"); }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error("DATABASE_URL must start with postgresql://");
  if (!/\.neon\.tech$/i.test(u.hostname) && !process.env.PG_HTTP_ENDPOINT) throw new Error("DATABASE_URL must be a Neon database (host ending in .neon.tech). Other Postgres servers need PG_HTTP_ENDPOINT (a Neon-compatible SQL-over-HTTP proxy).");
  const endpoint = process.env.PG_HTTP_ENDPOINT || "https://" + u.hostname + "/sql";
  const headers = { "Content-Type": "application/json", "Neon-Connection-String": String(url), "Neon-Raw-Text-Output": "true", "Neon-Array-Mode": "true" };
  const host = u.hostname.replace(/^([^.]{6})[^.]*/, "$1…"); // for messages: never the user or password

  async function post(body, extra) {
    let r;
    try { r = await fetch(endpoint, { method: "POST", headers: Object.assign({}, headers, extra), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { const err = new Error(`Database ${host} unreachable: ${e.cause && e.cause.code || e.message}`); err.network = true; throw err; }
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!r.ok) { const err = new Error(`Database error${j && j.code ? " " + j.code : ""}: ${(j && j.message) || txt.slice(0, 200) || r.status}`); err.status = r.status; err.pgcode = j && j.code; throw err; }
    return j;
  }
  const rowsOf = res => (res.rows || []).map(row => Object.fromEntries((res.fields || []).map((f, i) => [f.name, row[i]])));
  return {
    host,
    // One statement. Returns rows as objects with text values.
    async query(text, params = []) { return rowsOf(await post({ query: text, params: params.map(p => p == null ? null : String(p)) })); },
    // Several statements in one transaction. Returns one row list per statement.
    async batch(list) {
      if (!list.length) return [];
      const j = await post({ queries: list.map(q => ({ query: q.query, params: (q.params || []).map(p => p == null ? null : String(p)) })) }, { "Neon-Batch-Isolation-Level": "ReadCommitted", "Neon-Batch-Read-Only": "false" });
      return (j.results || []).map(rowsOf);
    },
  };
}

// SQLite JSON views (db/schema.sql) → Postgres jsonb. One source of truth for BI views on both databases.
//   json_extract(x.data,'$.a.b')                      → (x.data #>> '{a,b}')
//   json_array_length(json_extract(x.data,'$.a'))     → jsonb_array_length(x.data #> '{a}')
//   DROP VIEW IF EXISTS v;                            → DROP VIEW IF EXISTS v CASCADE;
const pathOf = p => "'{" + p.replace(/^\$\./, "").split(".").join(",") + "}'";
function sqliteViewsToPg(sql) {
  return String(sql)
    .split(/\r?\n/).filter(l => !/^\s*--/.test(l)).join("\n")
    .replace(/json_array_length\(\s*json_extract\(\s*([\w.]+)\s*,\s*'(\$[\w.]+)'\s*\)\s*\)/g, (m, col, p) => `COALESCE(jsonb_array_length(${col} #> ${pathOf(p)}), 0)`)
    .replace(/json_extract\(\s*([\w.]+)\s*,\s*'(\$[\w.]+)'\s*\)/g, (m, col, p) => `(${col} #>> ${pathOf(p)})`)
    .replace(/DROP VIEW IF EXISTS (\w+);/g, "DROP VIEW IF EXISTS $1 CASCADE;")
    .split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
}

module.exports = { neon, sqliteViewsToPg };
