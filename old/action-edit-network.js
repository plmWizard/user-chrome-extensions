// == AW: Run {mode:onEdit} scripts when network writes occur ==
// Triggers for Attachments and BOM because those UIs don't flip to mode=edit.
// Requires your loader to publish window.__AW_ACTION_SCRIPTS and __AW_RUN_SCRIPT.
//
// Watches same-origin requests made by FM via fetch/XMLHttpRequest.
// Fires after a 2xx response to POST/PATCH/DELETE on:
//   /api/v3/workspaces/{wsId}/items/{dmsId}/attachments
//   /api/v3/workspaces/{wsId}/items/{dmsId}/bom-items[/*]

(() => {
  const LOG = "[AW onEdit-net]";
  if (window.__AW_ONEDIT_NET_INIT__) return;
  window.__AW_ONEDIT_NET_INIT__ = true;

  /* ------------------ URL context helpers ------------------ */
  function getWsAndDmsFromUrl(url = location.href) {
    try {
      const parts = new URL(url, location.origin);
      const path = parts.pathname.split("/").filter(Boolean);
      const i = path.indexOf("workspaces");
      const wsId = i >= 0 ? path[i + 1] : null;

      const rawItemId = parts.searchParams.get("itemId");
      let dmsId = null;
      if (rawItemId) {
        // urn`adsk,plm`tenant,workspace,item`TENANT,WS,DMS
        const decoded = decodeURIComponent(rawItemId);
        const segs = decoded.split("`").pop()?.split(",") || [];
        dmsId = segs[segs.length - 1] || null;
      }
      return { wsId, dmsId };
    } catch {
      return { wsId: null, dmsId: null };
    }
  }

  function currentTabToken() {
    const p = location.pathname;
    if (p.includes("/itemDetails")) return "itemDetails";
    if (p.includes("/grid")) return "grid";
    if (p.includes("/bom/")) return "bom";
    if (p.includes("/workflowMap")) return "workflowMap";
    const q = new URLSearchParams(location.search).get("tab");
    return q || "";
  }

  /* ------------------ Script selection ------------------ */
  function parseMeta(str) {
    if (!str) return null;
    const m = /\{([^}]+)\}/.exec(str);
    if (!m) return null;
    const obj = {};
    m[1].split(",").map(s => s.trim()).forEach(pair => {
      const [k, v] = pair.split(":").map(s => s && s.trim());
      if (k && v) obj[k.toLowerCase()] = v.toLowerCase();
    });
    return obj;
  }

  function isOnEditForTab(script, tab) {
    const name = script.displayName || script.name || "";
    const meta = parseMeta(name);
    if (!meta) return false;
    return (meta.tab || "") === String(tab || "").toLowerCase()
        && (meta.mode || "") === "onedit";
  }

  async function runOnEditForTab(tab, contextExtras = {}) {
    const scripts = Array.isArray(window.__AW_ACTION_SCRIPTS) ? window.__AW_ACTION_SCRIPTS : null;
    if (!scripts || !scripts.length) {
      // Listener may run before loader; try again soon.
      scheduleOnce(`await-scripts:${tab}`, () => runOnEditForTab(tab, contextExtras), 250);
      return;
    }
    const targets = scripts.filter(s => isOnEditForTab(s, tab));
    if (!targets.length) return;

    const ctx = {
      when: "network-write",
      tab,
      url: location.href,
      ...getWsAndDmsFromUrl(),
      ...contextExtras
    };

    const runner = window.__AW_RUN_SCRIPT;
    for (const scr of targets) {
      try {
        if (typeof runner === "function") {
          await runner(scr, ctx);           // preferred: your POST executor
        } else if (scr.code) {
          // Rare case if you ever publish code
          const fn = new Function("context", `"use strict";\n${scr.code}`);
          await fn(ctx);
        }
      } catch (e) {
        console.error(LOG, "Run error:", e);
      }
    }
  }

  /* ------------------ Network watcher ------------------ */
  const TRIG_METHODS = new Set(["POST", "PATCH", "DELETE"]);

  function buildMatchers(wsId, dmsId) {
    // If wsId/dmsId missing (e.g., from dashboard), set generic matchers too.
    const parts = {
      ws: wsId ? String(wsId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "\\d+",
      dms: dmsId ? String(dmsId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "\\d+"
    };

    // Exact attachments endpoint
    const attachments = new RegExp(
      `/api/v3/workspaces/${parts.ws}/items/${parts.dms}/attachments$`, "i"
    );

    // bom-items + optional /anything
    const bomItems = new RegExp(
      `/api/v3/workspaces/${parts.ws}/items/${parts.dms}/bom-items(?:/.*)?$`, "i"
    );

    return { attachments, bomItems };
  }

  function classifyTarget(url) {
    const { wsId, dmsId } = getWsAndDmsFromUrl();
    const { attachments, bomItems } = buildMatchers(wsId, dmsId);
    if (attachments.test(url)) return "attachments";
    if (bomItems.test(url))     return "bom";
    return null;
  }

  // Debounce/merge rapid bursts (e.g., multi-row BOM edits)
  const timers = new Map();
  function scheduleOnce(key, fn, ms = 300) {
    clearTimeout(timers.get(key));
    const t = setTimeout(() => {
      timers.delete(key);
      try { fn(); } catch (e) { console.error(LOG, e); }
    }, ms);
    timers.set(key, t);
  }

  async function handleCandidateWrite(url, method, ok, status) {
    if (!ok) return;                 // only on success
    if (!TRIG_METHODS.has(method)) return;

    const which = classifyTarget(url);
    if (!which) return;

    // Map endpoint -> tab
    const tab = which === "attachments" ? "itemDetails"  // attachments panel lives under details UI
             : which === "bom"         ? "bom"
             : currentTabToken();

    // Coalesce multiple writes within 400ms per endpoint group
    scheduleOnce(`run:${which}`, () => runOnEditForTab(tab, { write: which, method }), 400);
  }

  /* ------------------ Hook fetch ------------------ */
  const _fetch = window.fetch;
  if (typeof _fetch === "function") {
    window.fetch = async function AWFetch(input, init = {}) {
      let url = "";
      let method = "GET";
      try {
        if (typeof input === "string") url = input;
        else if (input && input.url) url = input.url;
        method = (init?.method || (input && input.method) || "GET").toUpperCase();
      } catch {}

      const res = await _fetch.apply(this, arguments);
      try {
        const ok = res && res.ok;
        const status = res && res.status;
        if (TRIG_METHODS.has(method)) {
          // Only observe same-origin
          const u = new URL(url, location.origin);
          if (u.origin === location.origin) {
            handleCandidateWrite(u.pathname, method, ok, status);
          }
        }
      } catch (e) {
        // never break the app
      }
      return res;
    };
  }

  /* ------------------ Hook XHR ------------------ */
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    try {
      this.__aw_method = String(method || "GET").toUpperCase();
      // Only store pathname for comparison
      const u = new URL(url, location.origin);
      this.__aw_url = (u.origin === location.origin) ? u.pathname : null;
    } catch {
      this.__aw_url = null;
      this.__aw_method = String(method || "GET").toUpperCase();
    }
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const onDone = () => {
      try {
        if (!this.__aw_url) return;
        const ok = this.status >= 200 && this.status < 300;
        handleCandidateWrite(this.__aw_url, this.__aw_method, ok, this.status);
      } catch {}
    };
    this.addEventListener("loadend", onDone);
    return _send.apply(this, arguments);
  };

  console.log(LOG, "Initialized network listeners.");
})();
