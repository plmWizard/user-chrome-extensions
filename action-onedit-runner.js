// == AW: On-Edit Runner (URL flip + Network writes) ==
// Triggers scripts whose displayName contains: "{tab: <tab>, mode: onEdit}"
// - Fires when URL changes from mode=edit -> mode=view on same tab
// - ALSO fires after successful POST/PATCH/DELETE to Attachments or BOM endpoints
//
// Depends on your loader (action-tabs.js) publishing:
//   window.__AW_ACTION_SCRIPTS  (Array<{id, name}>)
//   window.__AW_RUN_SCRIPT       (function(scriptObj, ctx){ ... })
//
// Safe in MV3 isolated world: content scripts see each other's window.*
// Add to manifest with: "all_frames": true, "run_at": "document_idle"

(() => {
  const MOD = "[AW onEdit]";
  if (window.__AW_ONEDIT_RUNNER_INIT__) return;
  window.__AW_ONEDIT_RUNNER_INIT__ = true;

  /* ------------------ tab & url helpers ------------------ */
  function getParam(k, url = location.href) {
    try { return new URL(url).searchParams.get(k); } catch { return null; }
  }
  function currentTab() {
    const p = location.pathname;
    if (p.includes("/itemDetails")) return "itemDetails";
    if (p.includes("/grid"))       return "grid";
    if (p.includes("/bom/"))       return "bom";
    if (p.includes("/workflowMap"))return "workflowMap";
    return getParam("tab") || "";
  }

  /* ------------------ script matching ------------------ */
  function parseMeta(str) {
    if (!str) return null;
    const m = /\{([^}]*)\}/.exec(str);
    if (!m) return null;
    const obj = {};
    m[1].split(",").map(s => s.trim()).forEach(pair => {
      const [k, v] = pair.split(":").map(x => x && x.trim());
      if (k && v) obj[k.toLowerCase()] = v.toLowerCase();
    });
    return obj;
  }
  function isOnEditForTab(scr, tab) {
    const name = scr.displayName || scr.name || "";
    const meta = parseMeta(name);
    return !!meta && (meta.tab || "") === String(tab || "").toLowerCase()
           && (meta.mode || "") === "onedit";
  }
  async function runOnEdit(tab, context = {}) {
    const scripts = Array.isArray(window.__AW_ACTION_SCRIPTS) ? window.__AW_ACTION_SCRIPTS : null;
    if (!scripts || !scripts.length) {
      // try again shortly (loader might not have published yet)
      setTimeout(() => runOnEdit(tab, context), 250);
      return;
    }
    const targets = scripts.filter(s => isOnEditForTab(s, tab));
    if (!targets.length) return;

    const runner = window.__AW_RUN_SCRIPT;
    for (const scr of targets) {
      try {
        if (typeof runner === "function") {
          await runner(scr, context);
        }
      } catch (e) {
        console.error(MOD, "run error:", e);
      }
    }
  }

  /* ------------------ URL flip watcher ------------------ */
  let lastHref  = location.href;
  let lastTab   = currentTab();
  let lastMode  = (getParam("mode") || "").toLowerCase();
  let debounce  = null;

  function onPossibleRouteChange() {
    if (location.href === lastHref) return;
    const prevTab  = lastTab;
    const prevMode = lastMode;
    lastHref = location.href;
    lastTab  = currentTab();
    lastMode = (getParam("mode") || "").toLowerCase();

    clearTimeout(debounce);
    debounce = setTimeout(() => {
      // fire only when edit -> view AND same tab
      if (prevMode === "edit" && lastMode === "view" && prevTab && prevTab === lastTab) {
        runOnEdit(lastTab, { when: "url-edit-to-view", tab: lastTab, url: location.href });
      }
    }, 300);
  }

  // Patch history to catch SPA nav
  const _ps = history.pushState;
  const _rs = history.replaceState;
  history.pushState = function(){ const r = _ps.apply(this, arguments); onPossibleRouteChange(); return r; };
  history.replaceState = function(){ const r = _rs.apply(this, arguments); onPossibleRouteChange(); return r; };
  window.addEventListener("popstate", onPossibleRouteChange);
  // Safety poll
  setInterval(onPossibleRouteChange, 800);

  /* ------------------ Network write watcher ------------------ */
  const WRITE = new Set(["POST","PATCH","DELETE"]);
  // Match ANY ws/dms (don’t rely on page’s ws/dms — FM can write to related items)
  const RX_ATTACH = /\/api\/v3\/workspaces\/\d+\/items\/\d+\/attachments(?:\/.*)?$/i;
  const RX_BOM    = /\/api\/v3\/workspaces\/\d+\/items\/\d+\/bom-items(?:\/.*)?$/i;

  function classify(pathname) {
    if (RX_ATTACH.test(pathname)) return "attachments";
    if (RX_BOM.test(pathname))    return "bom";
    return null;
  }

  const timers = new Map();
  function once(key, fn, ms=400){
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(()=>{ timers.delete(key); try{fn();}catch(e){console.error(MOD,e);} }, ms));
  }

  async function handleWrite(pathname, method, ok) {
    if (!ok || !WRITE.has(method)) return;
    const which = classify(pathname);
    if (!which) return;
    const tab = which === "attachments" ? "itemDetails" : which; // attachments UX sits under itemDetails
    once(`run:${which}`, () => runOnEdit(tab, { when: "network-write", tab, write: which, method }), 400);
  }

  // fetch
  const _fetch = window.fetch;
  if (typeof _fetch === "function") {
    window.fetch = async function awFetch(input, init={}){
      let method = "GET", path="";
      try {
        method = String((init?.method || (input && input.method) || "GET")).toUpperCase();
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const u = new URL(url, location.origin);
        if (u.origin === location.origin) path = u.pathname;
      } catch {}
      const res = await _fetch.apply(this, arguments);
      try { handleWrite(path, method, !!(res && res.ok)); } catch {}
      return res;
    };
  }

  // XHR
  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url){
    try {
      this.__aw_m = String(method || "GET").toUpperCase();
      const u = new URL(url, location.origin);
      this.__aw_p = (u.origin === location.origin) ? u.pathname : "";
    } catch { this.__aw_p = ""; this.__aw_m = String(method||"GET").toUpperCase(); }
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body){
    const done = () => { try { handleWrite(this.__aw_p, this.__aw_m, this.status >=200 && this.status<300); } catch {} };
    this.addEventListener("loadend", done);
    return XS.apply(this, arguments);
  };

  // If the loader already published scripts, great; otherwise we’ll retry when runOnEdit() is called.
  console.log(MOD, "Initialized.");
})();
