(() => {
  const MOD = "[AW View Column Search]";
  const STYLE_ID = "aw-view-column-search-style";
  const SESSION_PREFIX = "aw_vcs_original_";
  const SEARCH_ROW_CLASS = "aw-vcs-row";
  const HEADER_INPUT_CLASS = "aw-vcs-input";
  const HEADER_BTN_CLASS = "aw-vcs-btn";

  let lastUrl = location.href;
  let observer = null;
  let injectTick = null;
  let netHooked = false;

  let currentTableauRef = null;
  let latestKnownPutPayload = null;
  const metaFieldsCache = new Map();

  async function isEnabled() {
    if (typeof window.__AW_GET_SETTING__ === "function") {
      return !!(await window.__AW_GET_SETTING__("viewColumnSearch"));
    }
    return true;
  }

  function log(...a) {
    console.log(MOD, ...a);
  }

  function warn(...a) {
    console.warn(MOD, ...a);
  }

  function safeJsonParse(v) {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }

  function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function normalizeUrn(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[:.\-]/g, "")
      .replace(/\s+/g, "");
  }

  function getWorkspaceIdFromUrl() {
    const m = location.pathname.match(/\/workspaces\/(\d+)/i);
    return m ? m[1] : null;
  }

  function isItemPage() {
    return /\/items\/\d+/i.test(location.pathname);
  }

  function isWorkspacePage() {
    return /\/plm\/workspaces\/\d+/i.test(location.pathname);
  }

  function makeStorageKey(workspaceId, tableauId) {
    return `${SESSION_PREFIX}${workspaceId}_${tableauId}`;
  }

  function getTableauRefFromPath(pathname) {
    if (!pathname || !/\/api\/v3\/workspaces\/\d+\/tableaus\/\d+/i.test(pathname)) return null;
    const m = pathname.match(/\/api\/v3\/workspaces\/(\d+)\/tableaus\/(\d+)/i);
    if (!m) return null;
    return {
      workspaceId: m[1],
      tableauId: m[2],
      self: `/api/v3/workspaces/${m[1]}/tableaus/${m[2]}`
    };
  }

  function rememberTableauRefFromUrl(url) {
    try {
      const u = new URL(url, location.origin);
      const ref = getTableauRefFromPath(u.pathname);
      if (ref) currentTableauRef = ref;
    } catch {}
  }

  async function fetchJson(url, init = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(init.headers || {})
      },
      ...init
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
    }

    return res.json();
  }

  async function fetchMetaFields(workspaceId) {
    if (!workspaceId) throw new Error("Workspace id not found");
    if (metaFieldsCache.has(workspaceId)) {
      return deepClone(metaFieldsCache.get(workspaceId));
    }

    const data = await fetchJson(`/api/v3/workspaces/${workspaceId}/tableaus`, {
      headers: {
        Accept: "application/vnd.autodesk.plm.meta+json"
      }
    });

    if (!Array.isArray(data)) {
      throw new Error("Unexpected meta response for tableau fields");
    }

    metaFieldsCache.set(workspaceId, data);
    return deepClone(data);
  }

  async function fetchCurrentTableauResult() {
    if (!currentTableauRef?.self) {
      throw new Error("Could not determine active tableau id. Reload the page and try again.");
    }
    return await fetchJson(currentTableauRef.self);
  }

  function hookNetwork() {
    if (netHooked) return;
    netHooked = true;

    const _fetch = window.fetch;
    if (typeof _fetch === "function") {
      window.fetch = async function awVcsFetch(input, init = {}) {
        const method = String(init?.method || (input && input.method) || "GET").toUpperCase();
        const url = typeof input === "string" ? input : (input && input.url) || "";

        rememberTableauRefFromUrl(url);

        if (method === "PUT") {
          try {
            const u = new URL(url, location.origin);
            const ref = getTableauRefFromPath(u.pathname);
            if (ref && typeof init.body === "string") {
              const bodyObj = safeJsonParse(init.body);
              if (bodyObj?.columns?.length) {
                latestKnownPutPayload = deepClone(bodyObj);
                currentTableauRef = ref;
                log("Captured real Fusion PUT payload baseline.");
              }
            }
          } catch {}
        }

        return _fetch.apply(this, arguments);
      };
    }

    const XO = XMLHttpRequest.prototype.open;
    const XS = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
      this.__aw_vcs_method = method;
      this.__aw_vcs_url = url;
      rememberTableauRefFromUrl(url);
      return XO.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      try {
        const method = String(this.__aw_vcs_method || "GET").toUpperCase();
        const u = new URL(this.__aw_vcs_url, location.origin);
        const ref = getTableauRefFromPath(u.pathname);
        if (method === "PUT" && ref && typeof body === "string") {
          const bodyObj = safeJsonParse(body);
          if (bodyObj?.columns?.length) {
            latestKnownPutPayload = deepClone(bodyObj);
            currentTableauRef = ref;
            log("Captured real Fusion XHR PUT payload baseline.");
          }
        }
      } catch {}

      return XS.apply(this, arguments);
    };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .ht_clone_top.handsontable {
        height: 72px !important;
      }
      .ht_clone_top.handsontable .wtHolder {
        height: 72px !important;
      }
      .ht_clone_top.handsontable .wtHider {
        height: auto !important;
      }
      .ht_clone_top.handsontable thead tr,
      .ht_clone_top.handsontable thead th {
        height: 72px !important;
        vertical-align: top !important;
      }
      .ht_clone_top.handsontable thead th > div,
      .ht_clone_top.handsontable .relative,
      .ht_clone_top.handsontable .header-title {
        overflow: visible !important;
      }
      .ht_clone_top.handsontable .relative {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 4px !important;
        min-height: 64px !important;
        padding-bottom: 4px !important;
      }
      .${SEARCH_ROW_CLASS} {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
        width: 100%;
      }
      .${HEADER_INPUT_CLASS} {
        flex: 1 1 auto;
        min-width: 50px;
        width: 100%;
        height: 22px;
        border: 1px solid #d7dce5;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 11px;
        line-height: 18px;
        outline: none;
        background: #fff;
        color: #222;
        box-sizing: border-box;
      }
      .${HEADER_INPUT_CLASS}:focus {
        border-color: #ff8000;
        box-shadow: 0 0 0 2px rgba(255,128,0,.12);
      }
      .${HEADER_BTN_CLASS},
      .aw-vcs-clear {
        height: 22px;
        min-width: 22px;
        border: 1px solid #d7dce5;
        border-radius: 4px;
        background: #fff;
        cursor: pointer;
        font-size: 11px;
        line-height: 1;
        padding: 0 5px;
        box-sizing: border-box;
      }
      .${HEADER_BTN_CLASS}:hover,
      .aw-vcs-clear:hover {
        border-color: #ff8000;
        color: #ff8000;
      }
      .aw-vcs-busy {
        opacity: 0.65;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function getHeaderMeta(th) {
    const headerEl = th.querySelector(".header[field-id]");
    if (!headerEl) return null;

    const rawFieldUrn = headerEl.getAttribute("field-id") || "";
    const title = (headerEl.getAttribute("title") || headerEl.textContent || "").trim();
    const lastToken = String(rawFieldUrn || "")
      .split(/[:.\-]/)
      .filter(Boolean)
      .pop()
      ?.toUpperCase() || "";

    return {
      headerEl,
      rawFieldUrn,
      normalizedFieldUrn: normalizeUrn(rawFieldUrn),
      title,
      lastToken
    };
  }

  function getVisibleHeaderCells() {
    return Array.from(document.querySelectorAll(".ht_clone_top thead th"))
      .map((th) => ({ th, meta: getHeaderMeta(th) }))
      .filter((x) => x.meta && x.meta.rawFieldUrn);
  }

  function findMetaField(metaFields, domMeta) {
    if (!Array.isArray(metaFields) || !domMeta) return null;

    let hit = metaFields.find((m) => normalizeUrn(m?.field?.urn) === domMeta.normalizedFieldUrn);
    if (hit) return hit;

    hit = metaFields.find((m) => {
      const id = String(m?.field?.__self__ || "").split("/").pop()?.toUpperCase() || "";
      return id === domMeta.lastToken;
    });
    if (hit) return hit;

    const title = String(domMeta.title || "").trim().toLowerCase();
    hit = metaFields.find((m) => String(m?.field?.title || "").trim().toLowerCase() === title);

    return hit || null;
  }

  function getContainsFilterDef(metaField) {
    const arr = Array.isArray(metaField?.applicableFilters) ? metaField.applicableFilters : [];
    return arr.find((f) => /\/api\/v3\/filter-types\/2$/i.test(f.link)) || null;
  }

  function buildAppliedFilters(filterDef, value) {
    return {
      filters: [
        {
          key: `aw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: filterDef.link,
          value: value,
          selectedRelationalOperator: {
            link: filterDef.link,
            label: filterDef.label,
            name: filterDef.name,
            allowValue: filterDef.allowValue,
            valueType: filterDef.valueType
          }
        }
      ],
      matchRule: "ALL"
    };
  }

  function buildMinimalColumnsFromDom(metaFields, targetDomMeta = null, searchValue = "") {
    const headerCells = getVisibleHeaderCells();
    const columns = [];

    headerCells.forEach(({ meta }, idx) => {
      const metaField = findMetaField(metaFields, meta);
      if (!metaField) return;

      const col = {
        field: deepClone(metaField.field),
        group: deepClone(metaField.group),
        allowMultipleFilters: !!metaField.allowMultipleFilters,
        displayOrder: idx,
        applicableFilters: deepClone(metaField.applicableFilters || [])
      };

      if (
        targetDomMeta &&
        searchValue &&
        normalizeUrn(metaField?.field?.urn) === normalizeUrn(findMetaField(metaFields, targetDomMeta)?.field?.urn)
      ) {
        const contains = getContainsFilterDef(metaField);
        if (contains) {
          col.appliedFilters = buildAppliedFilters(contains, searchValue);
        }
      }

      columns.push(col);
    });

    return columns;
  }

  async function buildBaselinePayload(metaFields) {
    const result = await fetchCurrentTableauResult();

    if (latestKnownPutPayload?.columns?.length) {
      const payload = deepClone(latestKnownPutPayload);
      payload.__self__ = currentTableauRef.self;
      if (!payload.urn && result.urn) payload.urn = result.urn;
      if (!payload.name && result.name) payload.name = result.name;
      return payload;
    }

    return {
      __self__: currentTableauRef.self,
      urn: result.urn,
      name: result.name || "Quick Search View",
      columns: buildMinimalColumnsFromDom(metaFields)
    };
  }

  async function applyColumnSearch(domMeta, searchValue) {
    const value = String(searchValue || "").trim();
    if (!value) return;

    const workspaceId = getWorkspaceIdFromUrl();
    const metaFields = await fetchMetaFields(workspaceId);
    const targetMetaField = findMetaField(metaFields, domMeta);

    if (!targetMetaField) {
      throw new Error(`No metadata match found for "${domMeta.title || domMeta.rawFieldUrn}"`);
    }

    const contains = getContainsFilterDef(targetMetaField);
    if (!contains) {
      throw new Error(`Column "${targetMetaField?.field?.title}" does not support Contains filter`);
    }

    if (!currentTableauRef?.self) {
      await fetchCurrentTableauResult();
    }

    const baseline = await buildBaselinePayload(metaFields);

    const storageKey = makeStorageKey(currentTableauRef.workspaceId, currentTableauRef.tableauId);
    if (!sessionStorage.getItem(storageKey)) {
      sessionStorage.setItem(storageKey, JSON.stringify(deepClone(baseline)));
    }

    let payload = deepClone(baseline);

    if (Array.isArray(payload.columns) && payload.columns.length) {
      let matched = false;

      payload.columns = payload.columns.map((col) => {
        const same =
          normalizeUrn(col?.field?.urn) === normalizeUrn(targetMetaField?.field?.urn) ||
          String(col?.field?.id || "").trim().toUpperCase() === domMeta.lastToken ||
          String(col?.field?.title || "").trim().toLowerCase() === String(targetMetaField?.field?.title || "").trim().toLowerCase();

        if (!same) return col;

        matched = true;
        return {
          ...col,
          appliedFilters: buildAppliedFilters(contains, value)
        };
      });

      if (!matched) {
        payload.columns.push({
          field: deepClone(targetMetaField.field),
          group: deepClone(targetMetaField.group),
          allowMultipleFilters: !!targetMetaField.allowMultipleFilters,
          displayOrder: payload.columns.length,
          applicableFilters: deepClone(targetMetaField.applicableFilters || []),
          appliedFilters: buildAppliedFilters(contains, value)
        });
      }
    } else {
      payload.columns = buildMinimalColumnsFromDom(metaFields, domMeta, value);
    }

    await fetchJson(currentTableauRef.self, {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    latestKnownPutPayload = deepClone(payload);
    log("Applied quick search", targetMetaField?.field?.title, value);
  }

  async function restoreOriginalFiltersIfNeeded() {
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith(SESSION_PREFIX));
    if (!keys.length) return;

    for (const key of keys) {
      const payload = safeJsonParse(sessionStorage.getItem(key));
      if (!payload?.__self || !Array.isArray(payload?.columns)) {
        sessionStorage.removeItem(key);
        continue;
      }

      try {
        await fetchJson(payload.__self, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        latestKnownPutPayload = deepClone(payload);
      } catch (e) {
        warn("Could not restore original tableau payload", e);
      } finally {
        sessionStorage.removeItem(key);
      }
    }
  }

  function buildSearchRow(domMeta) {
    const row = document.createElement("div");
    row.className = SEARCH_ROW_CLASS;

    const input = document.createElement("input");
    input.type = "text";
    input.className = HEADER_INPUT_CLASS;
    input.placeholder = "Search";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = HEADER_BTN_CLASS;
    btn.title = "Search";
    btn.textContent = "⌕";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "aw-vcs-clear";
    clear.title = "Clear";
    clear.textContent = "×";

    async function doSearch() {
      const value = input.value.trim();
      if (!value) return;

      row.classList.add("aw-vcs-busy");
      try {
        await applyColumnSearch(domMeta, value);
      } catch (e) {
        console.error(MOD, e);
        alert(`Quick search failed for ${domMeta.title || "column"}\n\n${e.message || e}`);
      } finally {
        row.classList.remove("aw-vcs-busy");
      }
    }

    async function doClear() {
      input.value = "";
      row.classList.add("aw-vcs-busy");
      try {
        await restoreOriginalFiltersIfNeeded();
      } finally {
        row.classList.remove("aw-vcs-busy");
      }
    }

    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await doSearch();
      }
    });

    btn.addEventListener("click", doSearch);
    clear.addEventListener("click", doClear);

    row.appendChild(input);
    row.appendChild(btn);
    row.appendChild(clear);
    return row;
  }

  function injectSearchInputs() {
    const headerCells = getVisibleHeaderCells();
    if (!headerCells.length) return;

    ensureStyles();

    headerCells.forEach(({ th, meta }) => {
      if (!meta?.rawFieldUrn) return;
      if (th.querySelector(`.${SEARCH_ROW_CLASS}`)) return;

      const container =
        th.querySelector(".relative") ||
        th.querySelector(".header-title") ||
        th;

      if (!container) return;

      container.appendChild(buildSearchRow(meta));
    });
  }

  async function refreshUiState() {
    const enabled = await isEnabled();

    if (!enabled) {
      document.querySelectorAll(`.${SEARCH_ROW_CLASS}`).forEach((el) => el.remove());
      return;
    }

    if (!isWorkspacePage() || isItemPage()) return;
    injectSearchInputs();
  }

  function startTimers() {
    if (injectTick) clearInterval(injectTick);

    injectTick = setInterval(async () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (isItemPage()) {
          await restoreOriginalFiltersIfNeeded();
        }
      }
      refreshUiState();
    }, 900);
  }

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      refreshUiState();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function start() {
    hookNetwork();
    startObserver();
    startTimers();
    refreshUiState();

    if (typeof window.__AW_ON_SETTINGS_CHANGED__ === "function") {
      window.__AW_ON_SETTINGS_CHANGED__((changes) => {
        if (changes.viewColumnSearch) {
          refreshUiState();
        }
      });
    }
  }

  start();
})();