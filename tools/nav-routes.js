#!/usr/bin/env node
/* Lists, for every back-office role, the pages shown in the navigation and the routes the route guard allows.
 * Loads public/crm/app.js in a sandbox (no browser, no server), so it works before and after a navigation change.
 *   node tools/nav-routes.js                 print JSON
 *   node tools/nav-routes.js --save f.json   save it
 *   node tools/nav-routes.js --compare f.json   exit 1 if anything differs from a saved run
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROLES = ["admin", "manager", "agent", "marketing_manager", "marketing", "operations", "compliance", "partnerships"];
let src = fs.readFileSync(path.join(__dirname, "../public/crm/app.js"), "utf8");
// Older shells kept NAV and ACCESS private: expose them for this check only.
if (!/C\.NAV\s*=/.test(src)) src = src.replace("function shell()", "C.NAV = NAV; C.ACCESS = ACCESS;\n  function shell()");

function load() {
  const noop = () => {};
  const el = () => ({ addEventListener: noop, appendChild: noop, classList: { add: noop, remove: noop, toggle: noop }, style: {}, setAttribute: noop });
  const doc = { addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], createElement: el, documentElement: el(), body: el() };
  const win = { CRM_API: { routePrefix: "#/" }, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }), localStorage: { getItem: () => null, setItem: noop } };
  const ctx = vm.createContext({ window: win, document: doc, location: { hash: "" }, navigator: {}, setTimeout, clearTimeout, console, URLSearchParams, Notification: undefined, MutationObserver: function () { return { observe: noop }; } });
  ctx.self = win; ctx.localStorage = win.localStorage;
  vm.runInContext(src, ctx);
  return win.CRM;
}

// Old NAV: [group, [[route,label,icon,access,badge]]]. New NAV: [{hub, groups:[{items:[[route,label,icon,access,badge,desc]]}]}]
function navItems(NAV) {
  return NAV.flatMap(n => Array.isArray(n) ? n[1] : (n.groups || []).flatMap(g => g.items));
}

function run() {
  const out = {};
  for (const mt5 of ["manual", "api"]) for (const r of ROLES) {
    const C = load();
    C.state.user = { id: "u1", role: r, name: r, username: r };
    C.state.meta = { user: C.state.user, mt5: { mode: mt5 }, ib: {}, users: [], stages: [], outcomes: [] };
    const items = navItems(C.NAV);
    const nav = [...new Set(items.filter(i => i[3]()).map(i => i[0]))].sort();
    const routes = Object.keys(C.ACCESS).filter(k => C.ACCESS[k]()).sort();
    out[`${r}${mt5 === "api" ? " (MT5 api)" : ""}`] = { nav, routes, home: C.home() };
  }
  return out;
}

const res = run(), a = process.argv;
if (a.includes("--save")) { fs.writeFileSync(a[a.indexOf("--save") + 1], JSON.stringify(res, null, 1)); console.log("saved"); }
else if (a.includes("--compare")) {
  const before = JSON.parse(fs.readFileSync(a[a.indexOf("--compare") + 1], "utf8")); let bad = 0;
  for (const k of Object.keys(before)) for (const f of ["nav", "routes", "home"]) {
    const x = JSON.stringify(before[k][f]), y = JSON.stringify((res[k] || {})[f]);
    if (x !== y) { bad++; console.log(`✖ ${k} ${f}\n   before: ${x}\n   after:  ${y}`); }
  }
  for (const k of Object.keys(res)) console.log(`${k.padEnd(28)} ${String(res[k].nav.length).padStart(2)} pages · home ${res[k].home}`);
  console.log(bad ? `✖ ${bad} difference(s)` : "✔ every role sees exactly the same pages, routes and home as before");
  process.exit(bad ? 1 : 0);
} else console.log(JSON.stringify(res, null, 1));
