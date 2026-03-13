(() => {
  const MOD = "[AW onEdit]";
  if (window.__AW_ONEDIT_RUNNER_INIT__) return;
  window.__AW_ONEDIT_RUNNER_INIT__ = true;

  async function isEnabled() {
    if (typeof window.__AW_GET_SETTING__ === "function") {
      return await window.__AW_GET_SETTING__("onEditRunner");
    }
    return true;
  }

  function getParam(k, url = location.href) {
    try { return new URL(url).searchParams.get(k); } catch { return null; }
  }

  function currentTab() {
    const p = location.pathname;
    if (p.includes("/itemDetails")) return "itemDetails";
    if (p.includes("/grid")) return "grid";
    if (p.includes("/bom/")) return "bom";
    if (p.includes("/workflowMap")) return "workflowMap";
    return getParam("tab") || "";
  }

  function parseMeta(str) {
    if (!str) return null;
    const m = /\{([^}]*)\}/.exec(str);
    if (!m) return null;
    const obj = {};
    m[1].split(",").map((s) => s.trim()).forEach((pair) => {
      const idx = pair.indexOf(":");
      if (idx === -1) return;
      const k = pair.slice(0, idx).trim().toLowerCase();
      const v = pair.slice(idx + 1).trim().toLowerCase();
      if (k && v) obj[k] = v;
    });
    return obj;
  }

  function isOnEditForTab(scr, tab) {
    const name = scr.displayName || scr.name || "";
    const meta = parseMeta(name);
    return !!meta &&
      (meta.tab || "") === String(tab || "").toLowerCase() &&
      (meta.mode || "") === "onedit";
  }

  async function runOnEdit(tab, context = {}) {
    if (!(await isEnabled())) return;

    const scripts = Array.isArray(window.__AW_ACTION_SCRIPTS) ? window.__AW_ACTION_SCRIPTS : null;
    if (!scripts || !scripts.length) {
      setTimeout(() => runOnEdit(tab, context), 250);
      return;
    }

    const targets = scripts.filter((s) => isOnEditForTab(s, tab));
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

  let lastHref = location.href;
  let lastTab = currentTab();
  let lastMode = (getParam("mode") || "").toLowerCase();
  let debounce = null;

  function onPossibleRouteChange() {
    if (location.href === lastHref) return;
    const prevTab = lastTab;
    const prevMode = lastMode;
    lastHref = location.href;
    lastTab = currentTab();
    lastMode = (getParam("mode") || "").toLowerCase();

    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      if (!(await isEnabled())) return;
      if (prevMode === "edit" && lastMode === "view" && prevTab && prevTab === lastTab) {
        runOnEdit(lastTab, { when: "url-edit-to-view", tab: lastTab, url: location.href });
      }
    }, 300);
  }

  const _ps = history.pushState;
  const _rs = history.replaceState;
  history.pushState = function () {
    const r = _ps.apply(this, arguments);
    onPossibleRouteChange();
    return r;
  };
  history.replaceState = function () {
    const r = _rs.apply(this, arguments);
    onPossibleRouteChange();
    return r;
  };

  window.addEventListener("popstate", onPossibleRouteChange);
  setInterval(onPossibleRouteChange, 800);

  const WRITE = new Set(["POST", "PATCH", "DELETE"]);
  const RX_ATTACH = /\/api\/v3\/workspaces\/\d+\/items\/\d+\/attachments(?:\/.*)?$/i;
  const RX_BOM = /\/api\/v3\/workspaces\/\d+\/items\/\d+\/bom-items(?:\/.*)?$/i;

  function classify(pathname) {
    if (RX_ATTACH.test(pathname)) return "attachments";
    if (RX_BOM.test(pathname)) return "bom";
    return null;
  }

  const timers = new Map();
  function once(key, fn, ms = 400) {
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        try { fn(); } catch (e) { console.error(MOD, e); }
      }, ms)
    );
  }

  async function handleWrite(pathname, method, ok) {
    if (!(await isEnabled())) return;
    if (!ok || !WRITE.has(method)) return;
    const which = classify(pathname);
    if (!which) return;
    const tab = which === "attachments" ? "itemDetails" : which;
    once(`run:${which}`, () => runOnEdit(tab, { when: "network-write", tab, write: which, method }), 400);
  }

  const _fetch = window.fetch;
  if (typeof _fetch === "function") {
    window.fetch = async function awFetch(input, init = {}) {
      let method = "GET", path = "";
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

  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      this.__aw_m = String(method || "GET").toUpperCase();
      const u = new URL(url, location.origin);
      this.__aw_p = u.origin === location.origin ? u.pathname : "";
    } catch {
      this.__aw_p = "";
      this.__aw_m = String(method || "GET").toUpperCase();
    }
    return XO.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const done = () => {
      try {
        handleWrite(this.__aw_p, this.__aw_m, this.status >= 200 && this.status < 300);
      } catch {}
    };
    this.addEventListener("loadend", done);
    return XS.apply(this, arguments);
  };

  if (typeof window.__AW_ON_SETTINGS_CHANGED__ === "function") {
    window.__AW_ON_SETTINGS_CHANGED__((changes) => {
      if (changes.onEditRunner) {
        console.log(MOD, "Setting changed:", changes.onEditRunner.newValue);
      }
    });
  }

  console.log(MOD, "Initialized.");
})();