/* CRM data adapter for the Node server. The prototype swaps this file for one backed by its own database. */
window.CRM_API = {
  mode: "server",
  routePrefix: "#/",
  async call(method, ...args) {
    let r;
    try {
      r = await fetch("/api/crm/rpc", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Requested-With": "absel-crm" }, body: JSON.stringify({ method, args }) });
    } catch (e) { throw new Error("Can't reach the server. Check your connection."); }
    let d = {}; try { d = await r.json(); } catch (e) {}
    if (r.status === 401) { const e = new Error(d.error || "Please sign in."); e.auth = true; throw e; }
    if (!d.ok) { const e = new Error(d.error || "Something went wrong."); e.fields = d.fields; e.gate = d.gate; throw e; }
    return d.result;
  },
  // Returns the user, or {need_code:true} when the account uses two-step verification
  async login(username, password, code) {
    const r = await fetch("/api/crm/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, code: code || "" }) });
    const d = await r.json().catch(() => ({}));
    if (d.need_code) return { need_code: true, error: d.error };
    if (!d.ok) throw new Error(d.error || "Sign-in failed.");
    return d.user;
  },
  async changePassword(current, password) {
    const r = await fetch("/api/crm/password", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Requested-With": "absel-crm" }, body: JSON.stringify({ current, password }) });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) { const e = new Error(d.error || "Couldn't change the password."); e.fields = d.fields; throw e; }
    return d.user;
  },
  async logout() { await fetch("/api/crm/logout", { method: "POST", credentials: "same-origin" }).catch(() => {}); },
  download(filename, text, type) {
    const blob = new Blob([text], { type: type || "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return Promise.resolve(true);
  },
  subscribe(cb) { const t = setInterval(() => { if (!document.hidden) cb(); }, 30000); return () => clearInterval(t); },
};
