// == FM Action Buttons ==
// Adds action buttons to native FM tabs based on scripts displayName metadata.
//
// New syntax example (only creates a button when mode=button):
// "Create tasks for all rows that dont have tasks assigned to it. {tab: bom, mode: button [color: #00FF80, name: Create Tasks]}"
//
// - Text BEFORE the first "{" becomes a tooltip (shown on hover).
// - Inside { ... } you must have: tab: <tabToken>, mode: button [ ...options... ]
// - Options inside [ ... ] can include: color: #RRGGBB, name: <Button Label>

(() => {
  const MOD_ID = "aw-action-buttons";
  const HOST_ID_PREFIX = "aw-action-host-"; // per-tab
  let lastUrl = "";
  let lastKey = "";

  /* ------------------------ URL / IDs ------------------------ */

  function getWsAndDmsFromUrl() {
    const parts = location.pathname.split("/").filter(Boolean);
    const wsIndex = parts.indexOf("workspaces");
    const wsId = wsIndex >= 0 ? parts[wsIndex + 1] : null;

    // dmsId comes from itemId=urn`... ,<ws>,<dmsId>
    const params = new URLSearchParams(location.search);
    const rawItemId = params.get("itemId");
    let dmsId = null;
    if (rawItemId) {
      const decoded = decodeURIComponent(rawItemId);
      const m = decoded.match(/[,`](\d+),(\d+)\s*$/);
      if (m) dmsId = m[2];
    }
    return { wsId, dmsId };
  }

  function currentTabToken() {
    // Prefer pathname; fallback to ?tab=
    const p = location.pathname;
    if (p.includes("/itemDetails")) return "itemDetails";
    if (p.includes("/grid")) return "grid";
    if (p.includes("/bom/")) return "bom";
    if (p.includes("/workflowMap")) return "workflowMap";
    const q = new URLSearchParams(location.search).get("tab");
    return q || "";
  }

  function getModeFromUrl() {
    const q = new URLSearchParams(location.search);
    return (q.get("mode") || "").toLowerCase(); // 'view' | 'edit' | ''
  }
  function isEditMode() {
    return getModeFromUrl() === "edit";
  }

  /* ------------------------ Fetch item scripts ------------------------ */

  async function fetchScripts(wsId, dmsId) {
    const url = `/api/v3/workspaces/${wsId}/items/${dmsId}/scripts`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok)
      throw new Error(`Scripts fetch failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /* ------------------------ Parse displayName ------------------------ */

  // New syntax:
  // "<tooltip text> {tab: <tabToken>, mode: button [color: #HEX, name: Label]}"
  function parseDisplayNameMeta(displayName, fallbackName) {
    if (!displayName) return null;

    const firstBrace = displayName.indexOf("{");
    if (firstBrace === -1) return null;

    const tooltip = displayName.slice(0, firstBrace).trim();
    const m = displayName.slice(firstBrace).match(/\{([^}]*)\}/);
    if (!m) return null;

    const inner = m[1];

    // Extract tab
    let tab = null;
    const tabM = inner.match(/tab\s*:\s*([a-zA-Z]+)/i);
    if (tabM) tab = tabM[1];

    // Extract mode and bracketed options
    let mode = null;
    let bracketRaw = "";
    const modeM = inner.match(/mode\s*:\s*([a-zA-Z]+)(?:\s*\[([^\]]*)\])?/i);
    if (modeM) {
      mode = (modeM[1] || "").toLowerCase();
      bracketRaw = modeM[2] || "";
    }

    // Parse [ color: #..., name: ... ] as simple comma-separated key:value
    const opts = {};
    if (bracketRaw) {
      bracketRaw.split(",").forEach((pair) => {
        const [kRaw, vRaw] = pair.split(":");
        if (!kRaw || !vRaw) return;
        const k = kRaw.trim().toLowerCase(); // color | name | (future)
        const v = vRaw.trim().replace(/^['"]|['"]$/g, "");
        opts[k] = v;
      });
    }

    if (!tab) return null;

    return {
      tab,
      mode: mode || "", // 'button' required for rendering
      color: opts.color || "#FF8000",
      name: opts.name || fallbackName || "Run",
      tooltip: tooltip || "", // text before '{...}'
    };
  }

  /* ------------------------ DOM anchors (native bars) ------------------------ */

  function findItemDetailsAnchor() {
    // React bar: <div id="command-bar-react"><div class="weave-button-wrapper">...</div></div>
    const reactBar = document.querySelector("#command-bar-react");
    if (reactBar) {
      const after = reactBar.querySelector(".weave-button-wrapper");
      if (after && after.parentElement)
        return { parent: after.parentElement, after };
      return { parent: reactBar, after: reactBar.lastElementChild };
    }
    // Fallback (rare): Angular bar
    const fallback = document.querySelector(
      "plm-command-bar #command-bar .grid-command-bar"
    );
    if (fallback) return { parent: fallback, after: fallback.lastElementChild };
    return null;
  }

  function findGridAnchor() {
    const el = document.querySelector(
      "plm-command-bar #command-bar .grid-command-bar"
    );
    if (!el) return null;
    return { parent: el, after: el.lastElementChild };
  }

  function findBomAnchor() {
    const bar = document.querySelector(
      "plm-command-bar #command-bar .bom-command-bar"
    );
    if (!bar) return null;
    const right = bar.querySelector(".command-bar-right");
    if (right && right.parentElement)
      return { parent: right.parentElement, before: right };
    return { parent: bar, after: bar.lastElementChild };
  }

  function getAnchorForTab(tab) {
    if (tab === "itemDetails") return findItemDetailsAnchor();
    if (tab === "grid") return findGridAnchor();
    if (tab === "bom") return findBomAnchor();
    return null;
  }

  /* ------------------------ Rendering ------------------------ */

  function ensureHost(parent, where, tabToken) {
    const id = HOST_ID_PREFIX + tabToken;
    let host = document.getElementById(id);
    if (host) return host;
    host = document.createElement("span");
    host.id = id;
    host.className = "aw-action-host";
    if (where?.before) parent.insertBefore(host, where.before);
    else if (where?.after) where.after.after(host);
    else parent.appendChild(host);
    return host;
  }

  function buttonId(scriptId) {
    return `${MOD_ID}-btn-${scriptId}`;
  }

  function clearDuplicates(host, scriptIds) {
    const wanted = new Set(scriptIds.map((id) => buttonId(id)));
    host.querySelectorAll("button.aw-action-btn").forEach((btn) => {
      if (!wanted.has(btn.id)) btn.remove();
    });
  }

  /* ---- color utilities ---- */
  function normalizeHex(hex) {
    let h = hex.trim().toUpperCase();
    if (h.startsWith("#")) h = h.slice(1);
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    return "#" + h;
  }
  function hexToRgb(hex) {
    const h = normalizeHex(hex).slice(1);
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function parseColorToRgb(color) {
    if (!color) return null;
    color = color.trim();
    if (color.startsWith("#")) return hexToRgb(color);
    const m = color.match(
      /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i
    );
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    return null;
  }
  function relLuminance({ r, g, b }) {
    const srgb = [r, g, b].map((v) => v / 255);
    const lin = srgb.map((v) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    );
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  function pickTextColor(bgColor, opts = {}) {
    const {
      threshold = 4.5,
      forceWhite = [],
      forceBlack = [],
      bias = 0,
    } = opts;

    const hexNorm =
      bgColor && bgColor.startsWith("#") ? normalizeHex(bgColor) : null;
    if (hexNorm && forceWhite.map(normalizeHex).includes(hexNorm))
      return "#fff";
    if (hexNorm && forceBlack.map(normalizeHex).includes(hexNorm))
      return "#000";

    const rgb = parseColorToRgb(bgColor);
    if (!rgb) return "#fff";

    const Lbg = relLuminance(rgb);
    const contrastWhite = (1.0 + 0.05) / (Lbg + 0.05);
    const contrastBlack = (Lbg + 0.05) / (0.0 + 0.05);

    const whiteOK = contrastWhite >= threshold;
    const blackOK = contrastBlack >= threshold;
    if (whiteOK && !blackOK) return "#fff";
    if (blackOK && !whiteOK) return "#000";

    if (bias !== 0) {
      const wScore = contrastWhite + Math.max(0, bias);
      const bScore = contrastBlack + Math.max(0, -bias);
      return wScore >= bScore ? "#fff" : "#000";
    }
    return contrastWhite >= contrastBlack ? "#fff" : "#000";
  }

  function applyDisabledAndTitle(btn, disabled) {
    const base = btn.getAttribute("data-base-title") || "";
    const title = disabled
      ? (base ? base + " — " : "") + "Actions are disabled in edit mode"
      : base;
    btn.disabled = !!disabled;
    btn.title = title;
    btn.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function makeButton({ id, name, color, tooltip }) {
    const btn = document.createElement("button");
    btn.id = buttonId(id);
    btn.className = "aw-action-btn";
    btn.textContent = name;
    btn.setAttribute("data-base-title", tooltip || "");
    btn.title = tooltip || "";

    if (color) {
      const label = pickTextColor(color, {
        threshold: 4.5,
        forceWhite: ["#FF8000", "#0696D7"],
        bias: 0.15,
      });
      btn.style.background = color;
      btn.style.color = label;
      btn.style.borderColor = color;
    }
    return btn;
  }

  function ensureStyles() {
    if (document.getElementById("aw-action-btn-styles")) return;
    const style = document.createElement("style");
    style.id = "aw-action-btn-styles";
    style.textContent = `
      .aw-action-btn { margin-left: .5rem; }
      .aw-action-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        -webkit-text-fill-color: currentColor;
      }
    `;
    document.head.appendChild(style);
  }

  /* ------------------------ Headers & POST runner ------------------------ */

  function guessTenant() {
    const host = location.hostname.split(".")[0] || "";
    return host;
  }

  function readCookie(name) {
    const prefix = name + "=";
    const parts = document.cookie ? document.cookie.split(";") : [];
    for (let part of parts) {
      part = part.trim();
      if (part.startsWith(prefix))
        return decodeURIComponent(part.slice(prefix.length));
    }
    return null;
  }

  function findInStorage(matchFn) {
    for (const store of [window.localStorage, window.sessionStorage]) {
      try {
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          const v = store.getItem(k);
          if (matchFn(k, v)) return v;
        }
      } catch {}
    }
    return null;
  }

  function findAccessToken() {
    return (
      findInStorage(
        (k, v) => typeof v === "string" && /^\w+\.\w+\.\w+$/.test(v)
      ) ||
      readCookie("access_token") ||
      readCookie("id_token") ||
      null
    );
  }

  function findUserId() {
    const fromStorage = findInStorage(
      (k, v) => /user.?id/i.test(k) && /^\d+$/.test(v)
    );
    if (fromStorage) return fromStorage;
    const fromCookie = readCookie("X-user-id") || readCookie("userId");
    if (fromCookie && /^\d+$/.test(fromCookie)) return fromCookie;
    return null;
  }

  function baseHeaders() {
    const h = {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    };
    const xsrf = readCookie("XSRF-TOKEN");
    if (xsrf) h["X-XSRF-TOKEN"] = xsrf;

    const tenant = guessTenant();
    if (tenant) h["X-Tenant"] = tenant;

    const uid = findUserId();
    if (uid) h["X-user-id"] = uid;

    const tok = findAccessToken();
    if (tok) h.Authorization = `Bearer ${tok}`;

    return h;
  }

  async function tryPost(url, withBody) {
    const headers = baseHeaders();
    const init = {
      method: "POST",
      headers: {
        ...headers,
        ...(withBody ? { "Content-Type": "application/json" } : {}),
      },
      credentials: "same-origin",
      body: withBody ? "{}" : undefined,
    };
    return fetch(url, init);
  }

  async function runScriptByVariants(selfUrl) {
    const candidates = [selfUrl, `${selfUrl}/run`, `${selfUrl}/execute`];
    let lastErr = "";
    for (const u of candidates) {
      for (const withBody of [true, false]) {
        try {
          const res = await tryPost(u, withBody);
          if (res.ok) return true;
          const text = await (async () => {
            try {
              return await res.text();
            } catch {
              return "";
            }
          })();
          lastErr = `POST ${u} ${withBody ? "(body)" : "(no body)"} → ${
            res.status
          } ${res.statusText}${text ? " – " + text : ""}`;
          if (![400, 401, 403, 404, 405, 415].includes(res.status))
            throw new Error(lastErr);
        } catch (e) {
          lastErr = String(e);
        }
      }
    }
    throw new Error(lastErr || "No working POST variant");
  }

  async function runScript(selfLink, btn) {
    if (isEditMode()) return; // extra safety; should already be disabled
    btn.disabled = true;
    const spinner = document.createElement("span");
    spinner.className = "aw-spin";
    btn.appendChild(spinner);
    try {
      const ok = await runScriptByVariants(selfLink);
      console.log("[FM Action Buttons] OK:", ok);
    } catch (e) {
      console.error("[FM Action Buttons] Error:", e);
      alert("Action failed.\n" + e);
    } finally {
      spinner.remove();
      btn.disabled = false;
    }
  }

  /* ------------------------ Build for current tab ------------------------ */

  function extractActionsForTab(scriptsJson, wantTab) {
    const out = [];
    const arr = (scriptsJson && scriptsJson.scripts) || [];
    for (const s of arr) {
      const meta = parseDisplayNameMeta(
        s.displayName || "",
        s.uniqueName || "Run"
      );
      if (!meta) continue;
      if ((meta.mode || "") !== "button") continue;

      if (
        meta.tab &&
        meta.tab.toLowerCase() === (wantTab || "").toLowerCase()
      ) {
        out.push({
          id: s.__self__, // full self link to POST
          name: meta.name,
          color: meta.color || "#FF8000",
          tooltip: meta.tooltip || "",
        });
      }
    }
    return out;
  }

  function mountButtonsForTab(tab, actions, opts = {}) {
    const { disabled = false } = opts;
    const where = getAnchorForTab(tab);
    if (!where) return false;

    const host = ensureHost(where.parent, where, tab);
    const ids = actions.map((a) => a.id.replace(/[^\d]+/g, "")); // numeric uniqueness
    clearDuplicates(host, ids);

    for (const a of actions) {
      const scriptIdNum = a.id.replace(/[^\d]+/g, "");
      let btn = host.querySelector("#" + buttonId(scriptIdNum));
      if (!btn) {
        btn = makeButton({
          id: scriptIdNum,
          name: a.name,
          color: a.color,
          tooltip: a.tooltip,
        });
        host.appendChild(btn);
        btn.addEventListener("click", async () => runScript(a.id, btn));
      }
      applyDisabledAndTitle(btn, !!disabled);
    }
    return true;
  }

  /* ------------------------ Network tap (watch POST/PATCH/DELETE) ------------------------ */

  function isMutationMethod(m) {
    return ["POST", "PATCH", "DELETE"].includes(String(m || "").toUpperCase());
  }

  // Build matchers on the fly for the current item
  function isInterestingUrl(url) {
    try {
      const u = new URL(url, location.origin); // handle relative urls
      const { wsId, dmsId } = getWsAndDmsFromUrl();
      if (!wsId || !dmsId) return false;

      // Want these shapes (any workspace ok, but same dmsId):
      // /api/v3/workspaces/<ws>/items/<dmsId>/attachments
      // /api/v3/workspaces/<ws>/items/<dmsId>/bom-items
      // /api/v3/workspaces/<ws>/items/<dmsId>/bom-items/<anything>
      const re = new RegExp(
        String.raw`^/api/v3/workspaces/\d+/items/${dmsId}/(attachments|bom-items)(?:/.*)?$`
      );
      return re.test(u.pathname);
    } catch {
      return false;
    }
  }

  // Debounced refresh so rapid burst of calls only triggers one rebuild
  let refreshTimer = null;
  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      requestAnimationFrame(injectOnce);
    }, 120);
  }

  function hookFetchAndXHR() {
    // Guard against double-hook
    if (window.__AW_NET_HOOKED__) return;
    window.__AW_NET_HOOKED__ = true;

    /* ---- fetch ---- */
    const _fetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        const method =
          (init && init.method) ||
          (typeof input === "object" && input.method) ||
          "GET";
        const url =
          typeof input === "string" ? input : (input && input.url) || "";

        if (isMutationMethod(method) && isInterestingUrl(url)) {
          // After the request settles, trigger refresh
          return _fetch(input, init).finally(scheduleRefresh);
        }
      } catch {
        // fall through
      }
      return _fetch(input, init);
    };

    /* ---- XHR ---- */
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
      method,
      url,
      async,
      user,
      password
    ) {
      this.__aw_method = method;
      this.__aw_url = url;
      return _open.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      try {
        if (
          isMutationMethod(this.__aw_method) &&
          isInterestingUrl(this.__aw_url)
        ) {
          this.addEventListener("loadend", scheduleRefresh);
        }
      } catch {
        // ignore
      }
      return _send.apply(this, arguments);
    };
  }

  /* ------------------------ Controller ------------------------ */

  async function injectOnce() {
    const { wsId, dmsId } = getWsAndDmsFromUrl();
    const tab = currentTabToken();
    if (!wsId || !dmsId || !tab) return;

    const key = `${wsId}:${dmsId}:${tab}`;
    if (key === lastKey && document.getElementById(HOST_ID_PREFIX + tab)) {
      // Update disabled state (mode might have flipped via network activity)
      const host = document.getElementById(HOST_ID_PREFIX + tab);
      if (host) {
        const nowEdit = isEditMode();
        host.querySelectorAll("button.aw-action-btn").forEach((b) => {
          applyDisabledAndTitle(b, nowEdit);
        });
      }
      return;
    }
    lastKey = key;

    try {
      const data = await fetchScripts(wsId, dmsId);

      // Expose to page (unchanged)
      (function publishScriptsForOnEdit() {
        if (!data || !Array.isArray(data.scripts)) return;
        const allScriptsArray = data.scripts.map((s) => ({
          id: s.__self__,
          name: s.displayName || s.uniqueName || "Unnamed",
        }));
        window.__AW_ACTION_SCRIPTS = allScriptsArray;
        if (typeof window.__AW_RUN_SCRIPT !== "function") {
          window.__AW_RUN_SCRIPT = async function (scriptObj) {
            return runScriptByVariants(scriptObj.id);
          };
        }
        try {
          window.dispatchEvent(
            new CustomEvent("aw:scripts-ready", {
              detail: { scripts: allScriptsArray, context: { wsId, dmsId } },
            })
          );
        } catch {}
      })();

      const actions = extractActionsForTab(data, tab);
      if (actions.length === 0) return;

      const edit = isEditMode();
      ensureStyles();
      mountButtonsForTab(tab, actions, { disabled: edit });
    } catch (e) {
      // console.debug("[FM Action Buttons] skip:", e);
    }
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastKey = "";
      }
      requestAnimationFrame(injectOnce);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    hookFetchAndXHR();
    injectOnce();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
  } else {
    startObserver();
  }
})();
