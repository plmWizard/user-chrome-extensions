(() => {
  const ROOT_ID = "aw-dms-bulk-tools";
  const STORAGE_KEY = "awCopiedDmsIds";

  function getChromeStorage() {
    if (typeof chrome === "undefined") return null;
    return chrome.storage?.local || null;
  }

  async function isEnabled() {
    if (typeof window.__AW_GET_SETTING__ === "function") {
      return !!(await window.__AW_GET_SETTING__("dmsBulkTools"));
    }
    return true;
  }

  function parseContextFromUrl() {
    const href = location.href;
    const wsMatch = href.match(/\/plm\/workspaces\/(\d+)\/items/i);
    const wsId = wsMatch ? wsMatch[1] : null;

    let itemId = null;
    const itemParam = new URLSearchParams(location.search).get("itemId");
    if (itemParam) {
      try {
        const decoded = decodeURIComponent(itemParam);
        const match = decoded.match(/[,`.](\d+)[,`.](\d+)\s*$/) || decoded.match(/(\d+)[,`.](\d+)\s*$/);
        if (match) itemId = match[2];
      } catch {}
    }

    if (!itemId) {
      const fallback = href.match(/\/items\/(\d+)(?:[/?#]|$)/i);
      if (fallback) itemId = fallback[1];
    }

    return { wsId, itemId };
  }

  function isItemsListView() {
    return /\/plm\/workspaces\/\d+\/items\/?$/i.test(location.pathname);
  }

  function isBomView() {
    const href = location.href;
    return href.includes("/items/bom/nested") && href.includes("tab=bom");
  }

  function isAffectedItemsView() {
    return location.href.includes("/items/affectedItems");
  }

  function removeRoot() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
  }

  function ensureStyles() {
    if (document.getElementById(`${ROOT_ID}-style`)) return;
    const style = document.createElement("style");
    style.id = `${ROOT_ID}-style`;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        top: 118px;
        right: 14px;
        width: 320px;
        max-height: 70vh;
        z-index: 2147483642;
        background: rgba(20, 27, 34, .97);
        border: 1px solid rgba(255, 128, 0, .45);
        color: #edf2f7;
        border-radius: 12px;
        box-shadow: 0 12px 28px rgba(0,0,0,.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font: 12px/1.35 system-ui, sans-serif;
      }
      #${ROOT_ID} .awh {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255,255,255,.08);
        font-weight: 700;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #${ROOT_ID} .awc { padding: 10px 12px; overflow: auto; }
      #${ROOT_ID} .awr { display: flex; gap: 8px; align-items: center; margin: 0 0 6px; }
      #${ROOT_ID} button {
        border: 1px solid rgba(255, 128, 0, .6);
        background: #ff8000;
        color: white;
        border-radius: 8px;
        padding: 5px 8px;
        font-size: 11px;
        cursor: pointer;
      }
      #${ROOT_ID} button.aw-subtle { background: #253140; border-color: rgba(255,255,255,.18); }
      #${ROOT_ID} textarea {
        width: 100%;
        min-height: 90px;
        resize: vertical;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,.2);
        background: #111820;
        color: #e6edf6;
        padding: 8px;
        font: 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      #${ROOT_ID} .aw-list { border: 1px solid rgba(255,255,255,.1); border-radius: 8px; max-height: 230px; overflow: auto; padding: 4px; }
      #${ROOT_ID} label { display: block; padding: 4px; border-radius: 6px; }
      #${ROOT_ID} label:hover { background: rgba(255,255,255,.06); }
      #${ROOT_ID} .aw-muted { color: #9fb1c3; }
      #${ROOT_ID} .aw-status { margin-top: 8px; min-height: 16px; color: #ffd199; }
    `;
    document.head.appendChild(style);
  }

  function extractItemsFromList() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/plm/workspaces/"][href*="/items/"]'));
    const seen = new Set();
    const items = [];

    anchors.forEach((a) => {
      if (a.closest(`#${ROOT_ID}`)) return;
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/items\/(\d+)(?:[/?#]|$)/i);
      if (!m) return;
      const dmsId = m[1];
      if (seen.has(dmsId)) return;
      seen.add(dmsId);
      const label = (a.textContent || "").trim() || `Item ${dmsId}`;
      items.push({ dmsId, label: label.slice(0, 80) });
    });

    return items;
  }

  function normalizeDmsIds(raw) {
    return Array.from(new Set(
      String(raw || "")
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
    ));
  }

  async function saveCopiedIds(ids) {
    const storage = getChromeStorage();
    if (!storage) return;
    await new Promise((resolve) => storage.set({ [STORAGE_KEY]: ids }, resolve));
  }

  async function loadCopiedIds() {
    const storage = getChromeStorage();
    if (!storage) return [];
    return new Promise((resolve) => {
      storage.get({ [STORAGE_KEY]: [] }, (result) => {
        resolve(Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
      });
    });
  }

  async function tryPost(urls, bodies) {
    let lastErr = null;
    for (const url of urls) {
      for (const body of bodies) {
        try {
          const res = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          });
          if (res.ok) return;
          lastErr = new Error(`${res.status} ${res.statusText}`);
        } catch (e) {
          lastErr = e;
        }
      }
    }
    throw lastErr || new Error("Unknown POST error");
  }

  async function addIdsToEndpoint(kind, wsId, itemId, ids, statusCb) {
    const urls = kind === "bom"
      ? [
          `/api/v1/rest/workspaces/${wsId}/items/${itemId}/boms`,
          `/api/rest/v1/workspaces/${wsId}/items/${itemId}/boms`,
          `/api/v3/workspaces/${wsId}/items/${itemId}/bom-items`
        ]
      : [
          `/api/v1/rest/workspaces/${wsId}/items/${itemId}/workflow-items`,
          `/api/rest/v1/workspaces/${wsId}/items/${itemId}/workflow-items`,
          `/api/v3/workspaces/${wsId}/items/${itemId}/workflow-items`
        ];

    let okCount = 0;
    let failCount = 0;

    const buildBodies = (id) => {
      if (kind === "bom") {
        return [
          { itemId: id },
          { dmsId: id },
          { items: [id] },
          { itemIds: [id] },
          { items: [{ itemId: id }] },
          { items: [{ dmsId: id }] }
        ];
      }

      // Keep the workflow payloads aligned with Autodesk docs examples first,
      // then fall back to legacy variants used by different tenants.
      return [
        { workflowItems: [{ itemId: id }] },
        { workflowItems: [{ dmsId: id }] },
        { workflowItems: [id] },
        { itemId: id },
        { dmsId: id },
        { items: [id] },
        { itemIds: [id] },
        { items: [{ itemId: id }] },
        { items: [{ dmsId: id }] }
      ];
    };

    for (let i = 0; i < ids.length; i++) {
      const id = Number(ids[i]);
      statusCb(`Adding ${i + 1}/${ids.length}: ${id}`);
      const bodies = buildBodies(id);
      try {
        await tryPost(urls, bodies);
        okCount++;
      } catch (e) {
        console.warn(`[AW bulk dms] ${kind} add failed for ${id}`, e);
        failCount++;
      }
    }

    statusCb(`Done. Added: ${okCount}, failed: ${failCount}`);
  }

  function createHeader(title) {
    const h = document.createElement("div");
    h.className = "awh";
    h.textContent = title;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "aw-subtle";
    close.textContent = "×";
    close.addEventListener("click", removeRoot);
    h.appendChild(close);

    return h;
  }

  function ensureRoot(title) {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    root.innerHTML = "";
    root.appendChild(createHeader(title));

    const content = document.createElement("div");
    content.className = "awc";
    root.appendChild(content);
    return content;
  }

  async function renderListPanel() {
    const content = ensureRoot("DMS ID Multi-copy");
    const items = extractItemsFromList();

    const topRow = document.createElement("div");
    topRow.className = "awr";

    const selectAll = document.createElement("button");
    selectAll.type = "button";
    selectAll.className = "aw-subtle";
    selectAll.textContent = "Select all";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "Copy selected dmsIDs";

    topRow.append(selectAll, copyBtn);

    const list = document.createElement("div");
    list.className = "aw-list";

    if (!items.length) {
      const none = document.createElement("div");
      none.className = "aw-muted";
      none.textContent = "No item rows detected in current viewport.";
      content.append(topRow, none);
      return;
    }

    items.forEach((item) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" value="${item.dmsId}" /> ${item.label} <span class="aw-muted">(${item.dmsId})</span>`;
      list.appendChild(label);
    });

    const status = document.createElement("div");
    status.className = "aw-status";

    selectAll.addEventListener("click", () => {
      list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
    });

    copyBtn.addEventListener("click", async () => {
      const ids = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.value);
      if (!ids.length) {
        status.textContent = "Select at least one item.";
        return;
      }
      await saveCopiedIds(ids);
      try {
        await navigator.clipboard.writeText(ids.join("\n"));
      } catch {}
      status.textContent = `Copied ${ids.length} dmsIDs.`;
    });

    const tip = document.createElement("div");
    tip.className = "aw-muted";
    tip.style.marginTop = "8px";
    tip.textContent = "Tip: use this on /items view, then open BOM or Affected Items tab and add them.";

    content.append(topRow, list, status, tip);
  }

  async function renderAddPanel(kind) {
    const title = kind === "bom" ? "Add copied IDs to BOM" : "Add copied IDs to Affected Items";
    const content = ensureRoot(title);
    const { wsId, itemId } = parseContextFromUrl();

    const ctx = document.createElement("div");
    ctx.className = "aw-muted";
    ctx.textContent = `Target WS ${wsId || "?"}, Item ${itemId || "?"}`;

    const ta = document.createElement("textarea");
    ta.placeholder = "Paste dmsIDs (newline, space, comma, or semicolon separated)";

    const row = document.createElement("div");
    row.className = "awr";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "aw-subtle";
    loadBtn.textContent = "Load copied";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = kind === "bom" ? "Add to BOM" : "Add to Affected";

    row.append(loadBtn, addBtn);

    const status = document.createElement("div");
    status.className = "aw-status";

    loadBtn.addEventListener("click", async () => {
      const ids = await loadCopiedIds();
      ta.value = ids.join("\n");
      status.textContent = ids.length ? `Loaded ${ids.length} copied dmsIDs.` : "No copied dmsIDs found.";
    });

    addBtn.addEventListener("click", async () => {
      if (!wsId || !itemId) {
        status.textContent = "Cannot detect workspace/item context from URL.";
        return;
      }
      const ids = normalizeDmsIds(ta.value);
      if (!ids.length) {
        status.textContent = "No valid numeric dmsIDs found.";
        return;
      }
      addBtn.disabled = true;
      try {
        await addIdsToEndpoint(kind, wsId, itemId, ids, (msg) => { status.textContent = msg; });
      } finally {
        addBtn.disabled = false;
      }
    });

    content.append(ctx, ta, row, status);

    const remembered = await loadCopiedIds();
    if (remembered.length) ta.value = remembered.join("\n");
  }

  async function render() {
    if (!(await isEnabled())) {
      removeRoot();
      return;
    }

    if (!isItemsListView() && !isBomView() && !isAffectedItemsView()) {
      removeRoot();
      return;
    }

    ensureStyles();

    if (isItemsListView()) {
      renderListPanel();
      return;
    }
    if (isBomView()) {
      renderAddPanel("bom");
      return;
    }
    if (isAffectedItemsView()) {
      renderAddPanel("affected");
      return;
    }
  }

  let lastHref = "";
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      render();
      return;
    }
    if (!document.getElementById(ROOT_ID) && (isItemsListView() || isBomView() || isAffectedItemsView())) {
      render();
    }
  }, 800);

  if (typeof window.__AW_ON_SETTINGS_CHANGED__ === "function") {
    window.__AW_ON_SETTINGS_CHANGED__((changes) => {
      if (changes.dmsBulkTools) render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();
