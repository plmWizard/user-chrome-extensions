(() => {
  const MOD = "[AW Search Panel]";
  const STYLE_ID = "aw-search-panel-style";
  const FAB_ID = "aw-search-panel-fab";
  const PANEL_ID = "aw-search-panel";
  const BACKDROP_ID = "aw-search-panel-backdrop";

  let pollTimer = null;
  let lastHref = location.href;

  const state = {
    workspaceId: null,
    searchTableauIdByWorkspace: new Map()
  };

  function log(...args) {
    console.log(MOD, ...args);
  }

  async function isEnabled() {
    if (typeof window.__AW_GET_SETTING__ === "function") {
      return !!(await window.__AW_GET_SETTING__("searchOverlay"));
    }
    return true;
  }

  function isWorkspaceItemsPage(url = location.href) {
    try {
      const u = new URL(url, location.origin);
      return /\/plm\/workspaces\/\d+\/items$/i.test(u.pathname);
    } catch {
      return false;
    }
  }

  function getWorkspaceIdFromUrl(url = location.href) {
    try {
      const u = new URL(url, location.origin);
      const m = u.pathname.match(/\/plm\/workspaces\/(\d+)\/items$/i);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  function getTenantFromHost() {
    return (location.hostname.split(".")[0] || "").toUpperCase();
  }

  function stripHtml(value) {
    const div = document.createElement("div");
    div.innerHTML = String(value == null ? "" : value);
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  }

  async function fetchJson(url, init = {}) {
    log("fetchJson()", url);
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json, text/plain, */*",
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

  async function fetchTableausList(workspaceId) {
    return fetchJson(`/api/v3/workspaces/${workspaceId}/tableaus`, {
      headers: { Accept: "application/json" }
    });
  }

  async function fetchTableauDefinition(workspaceId, tableauId) {
    return fetchJson(`/api/v3/workspaces/${workspaceId}/tableaus/${tableauId}`, {
      headers: { Accept: "application/vnd.autodesk.plm.meta+json" }
    });
  }

  async function fetchTableauResultsPage(workspaceId, tableauId, page = 1, pageSize = null) {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (pageSize != null) qs.set("pageSize", String(pageSize));

    return fetchJson(`/api/v3/workspaces/${workspaceId}/tableaus/${tableauId}?${qs.toString()}`, {
      headers: { Accept: "application/json" }
    });
  }

  async function fetchAllRowsForTableau(workspaceId, tableauId, onProgress) {
    const first = await fetchTableauResultsPage(workspaceId, tableauId, 1);
    const pageSize = Number(first?.pageSize || 100);
    const total = Number(first?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const items = [...(Array.isArray(first?.items) ? first.items : [])];

    if (typeof onProgress === "function") {
      onProgress(1, totalPages, items.length, total);
    }

    for (let page = 2; page <= totalPages; page++) {
      const data = await fetchTableauResultsPage(workspaceId, tableauId, page, pageSize);
      const pageItems = Array.isArray(data?.items) ? data.items : [];
      items.push(...pageItems);
      if (typeof onProgress === "function") {
        onProgress(page, totalPages, items.length, total);
      }
    }

    return items;
  }

  async function resolveSearchTableauId(workspaceId) {
    if (state.searchTableauIdByWorkspace.has(workspaceId)) {
      return state.searchTableauIdByWorkspace.get(workspaceId);
    }

    const data = await fetchTableausList(workspaceId);
    const tableaus = Array.isArray(data?.tableaus) ? data.tableaus : [];

    const hit =
      tableaus.find((t) => /search/i.test(String(t.title || ""))) ||
      tableaus.find((t) => /search/i.test(String(t.name || "")));

    const id = String(hit?.link || "").match(/\/tableaus\/(\d+)/i)?.[1] || null;
    state.searchTableauIdByWorkspace.set(workspaceId, id);

    log("resolveSearchTableauId()", { id, hit });
    return id;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${FAB_ID} {
        position: fixed !important;
        right: 18px !important;
        bottom: 18px !important;
        z-index: 2147483640 !important;
        border: 0 !important;
        border-radius: 999px !important;
        padding: 12px 16px !important;
        background: #ff8000 !important;
        color: #fff !important;
        font: 600 14px/1.2 system-ui, sans-serif !important;
        cursor: pointer !important;
        box-shadow: 0 10px 30px rgba(0,0,0,.18) !important;
      }

      #${BACKDROP_ID} {
        position: fixed !important;
        inset: 0 !important;
        background: rgba(15, 23, 42, 0.28) !important;
        z-index: 2147483641 !important;
      }

      #${PANEL_ID} {
        position: fixed !important;
        inset: 20px !important;
        z-index: 2147483642 !important;
        background: #ffffff !important;
        border-radius: 14px !important;
        box-shadow: 0 18px 60px rgba(0,0,0,.24) !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        font-family: system-ui, sans-serif !important;
        color: #111827 !important;
        opacity: 1 !important;
        visibility: visible !important;
      }

      #${PANEL_ID}, #${PANEL_ID} * {
        box-sizing: border-box !important;
      }

      .awsp-head {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 14px 16px !important;
        border-bottom: 1px solid #e5e7eb !important;
        background: #f8fafc !important;
        color: #111827 !important;
      }

      .awsp-title {
        font-size: 18px !important;
        font-weight: 700 !important;
        color: #111827 !important;
      }

      .awsp-meta {
        margin-left: auto !important;
        font-size: 12px !important;
        color: #6b7280 !important;
      }

      .awsp-close {
        border: 0 !important;
        background: #eef2f7 !important;
        color: #111827 !important;
        border-radius: 8px !important;
        padding: 8px 10px !important;
        cursor: pointer !important;
        font-weight: 700 !important;
      }

      .awsp-progress-wrap {
        height: 4px !important;
        background: #edf1f5 !important;
      }

      .awsp-progress {
        height: 100% !important;
        width: 0% !important;
        background: linear-gradient(90deg, #ff8000, #ffb15c) !important;
        transition: width .2s ease !important;
      }

      .awsp-loading,
      .awsp-error,
      .awsp-empty {
        padding: 18px 16px !important;
        color: #475569 !important;
        font-size: 14px !important;
        background: #ffffff !important;
      }

      .awsp-table-wrap {
        flex: 1 1 auto !important;
        overflow: auto !important;
        background: #ffffff !important;
      }

      .awsp-table {
        width: max-content !important;
        min-width: 100% !important;
        border-collapse: collapse !important;
        table-layout: fixed !important;
        background: #ffffff !important;
      }

      .awsp-table thead th {
        position: sticky !important;
        background: #f8fafc !important;
        border-bottom: 1px solid #e5e7eb !important;
        border-right: 1px solid #eef2f6 !important;
        padding: 8px 10px !important;
        text-align: left !important;
        vertical-align: top !important;
        min-width: 220px !important;
        max-width: 320px !important;
        color: #475569 !important;
      }

      .awsp-table thead tr.awsp-head-labels th {
        top: 0 !important;
        z-index: 3 !important;
      }

      .awsp-table thead tr.awsp-head-filters th {
        top: 39px !important;
        z-index: 2 !important;
        padding-top: 8px !important;
        padding-bottom: 8px !important;
      }

      .awsp-th-title {
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #475569 !important;
        white-space: nowrap !important;
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
      }

      .awsp-col-search {
        width: 100% !important;
        height: 34px !important;
        border: 1px solid #d3d9e2 !important;
        border-radius: 8px !important;
        padding: 0 10px !important;
        font-size: 13px !important;
        outline: none !important;
        background: #fff !important;
        color: #111827 !important;
      }

      .awsp-table tbody td {
        border-bottom: 1px solid #eef2f6 !important;
        border-right: 1px solid #eef2f6 !important;
        padding: 10px !important;
        vertical-align: top !important;
        background: #ffffff !important;
        min-width: 220px !important;
        max-width: 320px !important;
        color: #111827 !important;
        opacity: 1 !important;
        visibility: visible !important;
      }

      .awsp-row {
        cursor: pointer !important;
      }

      .awsp-row:hover td {
        background: #fff8f2 !important;
      }

      .awsp-cell-text {
        display: block !important;
        font-family: system-ui, sans-serif !important;
        font-size: 13px !important;
        line-height: 1.4 !important;
        color: #111827 !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        opacity: 1 !important;
        visibility: visible !important;
        background: transparent !important;
        text-shadow: none !important;
        -webkit-text-fill-color: #111827 !important;
        filter: none !important;
        transform: none !important;
        mix-blend-mode: normal !important;
      }

      .awsp-primary-link {
        color: #0b67c2 !important;
        text-decoration: none !important;
        font: inherit !important;
        opacity: 1 !important;
        visibility: visible !important;
        -webkit-text-fill-color: #0b67c2 !important;
      }

      .awsp-primary-link:hover {
        text-decoration: underline !important;
      }
    `;

    (document.head || document.documentElement || document.body).appendChild(style);
  }

  function removeFab() {
    document.getElementById(FAB_ID)?.remove();
  }

  function removePanel() {
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(BACKDROP_ID)?.remove();
  }

  function ensureFab() {
    if (document.getElementById(FAB_ID)) return;

    const btn = document.createElement("button");
    btn.id = FAB_ID;
    btn.type = "button";
    btn.textContent = "Open Search Panel";
    btn.addEventListener("click", () => openPanel());
    document.body.appendChild(btn);
  }

  function renderPanelShell() {
    removePanel();

    const backdrop = document.createElement("div");
    backdrop.id = BACKDROP_ID;
    backdrop.addEventListener("click", () => removePanel());

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="awsp-head">
        <div class="awsp-title">Search Panel</div>
        <div class="awsp-meta" id="awsp-meta">Preparing...</div>
        <button class="awsp-close" type="button" id="awsp-close">Close</button>
      </div>
      <div class="awsp-progress-wrap">
        <div class="awsp-progress" id="awsp-progress"></div>
      </div>
      <div id="awsp-body" class="awsp-loading">Loading Search records...</div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    panel.querySelector("#awsp-close")?.addEventListener("click", () => removePanel());

    return panel;
  }

  function setPanelProgress(panel, pct, meta, bodyText) {
    const progress = panel.querySelector("#awsp-progress");
    const metaEl = panel.querySelector("#awsp-meta");
    const body = panel.querySelector("#awsp-body");

    if (progress) progress.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
    if (metaEl) metaEl.textContent = meta || "";
    if (body && typeof bodyText === "string") {
      body.className = "awsp-loading";
      body.textContent = bodyText;
    }
  }

  function deriveColumnsFromDefinition(definition) {
    const cols = Array.isArray(definition?.columns) ? definition.columns : [];
    return cols
      .slice()
      .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
      .map((col) => ({
        id: String(col?.field?.id || col?.fieldId || col?.id || "").trim(),
        title: col?.field?.title || col?.title || col?.field?.id || col?.fieldId || "Column",
        keyCandidates: [
          col?.field?.id,
          col?.fieldId,
          col?.id,
          col?.field?.__self__,
          col?.field?.link,
          col?.field?.title,
          col?.title
        ]
          .map((v) => String(v || "").trim())
          .filter(Boolean),
        isPrimary:
          String(col?.field?.id || col?.fieldId || col?.id || "").toUpperCase() === "DESCRIPTOR" ||
          /item\s*descriptor/i.test(String(col?.field?.title || col?.title || ""))
      }));
  }

  function normalizeFieldValue(value) {
    if (value == null) return "";
    if (Array.isArray(value)) {
      return value.map((v) => normalizeFieldValue(v)).filter(Boolean).join(", ");
    }
    if (typeof value === "object") {
      if ("title" in value && value.title != null) return stripHtml(value.title);
      if ("name" in value && value.name != null) return stripHtml(value.name);
      if ("value" in value && value.value != null && value.value !== value) {
        return normalizeFieldValue(value.value);
      }
      return stripHtml(JSON.stringify(value));
    }
    return stripHtml(value);
  }

  function normalizeRows(rawItems, workspaceId) {
    const tenant = getTenantFromHost();

    return rawItems.map((entry) => {
      const itemLink = entry?.item?.link || "";
      const itemId = String(itemLink).match(/\/items\/(\d+)/i)?.[1] || "";
      const fields = Array.isArray(entry?.fields) ? entry.fields : [];

      const byId = {};
      for (const f of fields) {
        const normalized = normalizeFieldValue(f?.value);
        const keys = [
          f?.id,
          f?.fieldId,
          f?.field?.id,
          f?.field?.title,
          String(f?.field?.__self__ || "").split("/").pop(),
          String(f?.field?.link || "").split("/").pop()
        ]
          .map((v) => String(v || "").trim())
          .filter(Boolean);

        for (const key of keys) {
          byId[key] = normalized;
        }
      }

      return {
        itemId,
        itemDetailsUrl: `/plm/workspaces/${workspaceId}/items/itemDetails?view=full&tab=details&mode=view&itemId=${encodeURIComponent(
          `urn\`adsk,plm\`tenant,workspace,item\`${tenant},${workspaceId},${itemId}`
        )}`,
        byId
      };
    });
  }

  function createTextCell(text, asPrimaryLink = false) {
    const td = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "awsp-cell-text";

    const safeText = text == null ? "" : String(text);

    if (asPrimaryLink) {
      const a = document.createElement("a");
      a.href = "#";
      a.className = "awsp-primary-link";
      a.textContent = safeText;
      a.title = safeText;
      a.addEventListener("click", (e) => e.preventDefault());
      wrap.appendChild(a);
    } else {
      wrap.textContent = safeText;
      wrap.title = safeText;
    }

    td.appendChild(wrap);
    td.setAttribute("data-debug-value", safeText);
    return td;
  }

  function renderResults(panel, columns, rows) {
    const body = panel.querySelector("#awsp-body");
    const meta = panel.querySelector("#awsp-meta");
    const progress = panel.querySelector("#awsp-progress");
    if (!body) return;

    if (progress) progress.style.width = "100%";
    if (meta) meta.textContent = `${rows.length} records`;

    body.className = "awsp-table-wrap";
    body.innerHTML = "";

    const table = document.createElement("table");
    table.className = "awsp-table";

    const thead = document.createElement("thead");
    const headLabels = document.createElement("tr");
    headLabels.className = "awsp-head-labels";
    const headFilters = document.createElement("tr");
    headFilters.className = "awsp-head-filters";

    for (const col of columns) {
      const th1 = document.createElement("th");
      const label = document.createElement("div");
      label.className = "awsp-th-title";
      label.textContent = col.title;
      th1.appendChild(label);
      headLabels.appendChild(th1);

      const th2 = document.createElement("th");
      const input = document.createElement("input");
      input.className = "awsp-col-search";
      input.type = "text";
      input.placeholder = `Search ${col.title}`;
      input.dataset.colId = col.id;
      th2.appendChild(input);
      headFilters.appendChild(th2);
    }

    thead.appendChild(headLabels);
    thead.appendChild(headFilters);

    const tbody = document.createElement("tbody");


    function getCellValue(row, col) {
      const keys = [col.id, ...(Array.isArray(col.keyCandidates) ? col.keyCandidates : [])]
        .map((v) => String(v || "").trim())
        .filter(Boolean);

      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row.byId, key) && row.byId[key]) {
          return row.byId[key];
        }
      }

      return "";
    }

    function buildRows(nextRows) {
      tbody.innerHTML = "";

      if (!nextRows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = Math.max(1, columns.length);
        td.textContent = "No matching records";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      for (const row of nextRows) {
        const tr = document.createElement("tr");
        tr.className = "awsp-row";
        tr.dataset.itemUrl = row.itemDetailsUrl;

        for (const col of columns) {
          const value = getCellValue(row, col);
          const td = createTextCell(value, !!col.isPrimary);
          tr.appendChild(td);
        }

        tbody.appendChild(tr);
      }
    }

    buildRows(rows);

    table.appendChild(thead);
    table.appendChild(tbody);
    body.appendChild(table);

    const firstCell = tbody.querySelector("td .awsp-cell-text");
    log("first rendered cell text:", firstCell ? firstCell.textContent : "(none)");
    log("first rendered cell computed style:", firstCell ? getComputedStyle(firstCell).cssText : "(none)");

    const inputs = Array.from(thead.querySelectorAll(".awsp-col-search"));

    function getFilteredRows() {
      const filters = Object.fromEntries(
        inputs
          .map((inp) => [inp.dataset.colId, inp.value.trim().toLowerCase()])
          .filter(([, v]) => v)
      );

      const keys = Object.keys(filters);
      if (!keys.length) return rows;

      return rows.filter((row) =>
        keys.every((key) => {
          const col = columns.find((c) => c.id === key) || { id: key, keyCandidates: [key] };
          return String(getCellValue(row, col) || "").toLowerCase().includes(filters[key]);
        })
      );
    }

    function paint(nextRows) {
      buildRows(nextRows);
      if (meta) meta.textContent = `${nextRows.length} records`;
    }

    inputs.forEach((inp) => {
      inp.addEventListener("input", () => paint(getFilteredRows()));
    });

    tbody.addEventListener("click", (e) => {
      const row = e.target.closest(".awsp-row[data-item-url]");
      if (!row) return;
      const itemUrl = row.dataset.itemUrl;
      if (!itemUrl) return;
      window.location.href = itemUrl;
    });
  }

  async function openPanel() {
    try {
      if (!isWorkspaceItemsPage()) return;
      const workspaceId = state.workspaceId;
      if (!workspaceId) return;

      const tableauId = await resolveSearchTableauId(workspaceId);
      if (!tableauId) {
        throw new Error('Could not find a view with name/title containing "Search".');
      }

      const panel = renderPanelShell();
      setPanelProgress(panel, 10, "Loading Search definition...", "Loading Search records...");

      const definition = await fetchTableauDefinition(workspaceId, tableauId);
      const columns = deriveColumnsFromDefinition(definition);

      setPanelProgress(panel, 20, "Loading Search records...", "Loading Search records...");

      const rawItems = await fetchAllRowsForTableau(
        workspaceId,
        tableauId,
        (page, totalPages, loaded, total) => {
          const pct = 20 + Math.round((page / Math.max(1, totalPages)) * 80);
          setPanelProgress(
            panel,
            pct,
            `Page ${page}/${totalPages} • ${loaded}/${total || "?"}`,
            "Loading Search records..."
          );
        }
      );

      const rows = normalizeRows(rawItems, workspaceId);
      log("normalizeRows sample:", rows[0]);

      if (!rows.length) {
        const body = panel.querySelector("#awsp-body");
        if (body) {
          body.className = "awsp-empty";
          body.textContent = "Search view returned no records.";
        }
        return;
      }

      renderResults(panel, columns, rows);
    } catch (e) {
      console.error(MOD, e);
      const panel = document.getElementById(PANEL_ID) || renderPanelShell();
      const body = panel.querySelector("#awsp-body");
      const meta = panel.querySelector("#awsp-meta");
      if (meta) meta.textContent = "Error";
      if (body) {
        body.className = "awsp-error";
        body.textContent = String(e?.message || e);
      }
    }
  }

  async function evaluatePageState() {
    const enabled = await isEnabled();
    if (!enabled || !isWorkspaceItemsPage()) {
      removeFab();
      removePanel();
      return;
    }

    state.workspaceId = getWorkspaceIdFromUrl();
    ensureFab();
  }

  function resetStateForLocationChange() {
    state.workspaceId = null;
    removeFab();
    removePanel();
  }

  function start() {
    ensureStyles();
    evaluatePageState();

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        resetStateForLocationChange();
      }
      evaluatePageState();
    }, 700);

    if (typeof window.__AW_ON_SETTINGS_CHANGED__ === "function") {
      window.__AW_ON_SETTINGS_CHANGED__((changes) => {
        if (changes.searchOverlay) {
          evaluatePageState();
        }
      });
    }

    log("initialized");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
