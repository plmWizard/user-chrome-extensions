// === Fusion Manage "Second Tabs" – stable placement & toggle-to-close + iframe trim for FM pages ===
const EXT_MARKER_ID = "aw-second-tabs-root";
let currentKey = null;
let cache = new Map();
let urlTick = null;

/* ---------------- URL helpers ---------------- */
function getWsAndDmsFromUrl() {
  const href = location.href;
  const mWs = href.match(/\/plm\/workspaces\/(\d+)\/items\//i);
  const wsId = mWs ? mWs[1] : null;

  const params = new URLSearchParams(location.search);
  const rawItemId = params.get("itemId");
  let dmsId = null;

  if (rawItemId) {
    try {
      const dec = decodeURIComponent(rawItemId);
      const m =
        dec.match(/[,`.](\d+)[,`.](\d+)\s*$/) ||
        dec.match(/(\d+)[,`.](\d+)\s*$/);
      if (m) dmsId = m[2];
    } catch (e) {}
  }
  if (!dmsId) {
    const alt = href.match(/\/items\/(\d+)(?:[/?#]|$)/i);
    if (alt) dmsId = alt[1];
  }
  return { wsId, dmsId };
}

/* ---------------- API ---------------- */
async function fetchItem(wsId, dmsId) {
  const url = `/api/v3/workspaces/${wsId}/items/${dmsId}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`Item fetch failed ${res.status}`);
  return res.json();
}

/* ---------------- Parse “Tab row” ---------------- */
function parseTabs(itemJson) {
  const section = (itemJson?.sections || []).find(
    (s) =>
      String(s.title || "")
        .trim()
        .toLowerCase() === "tab row"
  );
  if (!section) return [];
  const map = new Map();
  (section.fields || []).forEach((f) =>
    map.set(
      String(f.title || "")
        .trim()
        .toLowerCase(),
      f
    )
  );

  const tabs = [];
  for (let i = 1; i <= 15; i++) {
    const name = map.get(`tab name ${i}`)?.value?.toString().trim() || "";
    const url = map.get(`url tab ${i}`)?.value?.toString().trim() || "";
    if (name && url) tabs.push({ name, url });
  }
  return tabs;
}

/* ---------------- DOM helpers ---------------- */
function rootEl() {
  return document.getElementById(EXT_MARKER_ID);
}

/** Find the toolbar that wraps the native tabs, then we insert AFTER that toolbar. */
function findTabsToolbar() {
  const menus = document.querySelectorAll("tabs-menu");
  let menu = null;
  for (const m of menus)
    if (m.offsetParent !== null) {
      menu = m;
      break;
    }
  if (!menu) return null;
  const toolbar = menu.closest("md-toolbar, .md-toolbar");
  return toolbar || menu;
}

/* ----- NEW: trim FM chrome inside iframe (same-origin only) ----- */
function maybeTrimIframeChrome(iframe) {
  try {
    const srcHost = new URL(iframe.src, location.origin).host;
    if (srcHost !== location.host) return; // different tenant/host → cannot touch due to SOP

    const inject = () => {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || !doc.head) return;

      // Only add once per iframe load
      if (doc.getElementById("__aw_trim_style")) return;

      const style = doc.createElement("style");
      style.id = "__aw_trim_style";
      style.textContent = `
  /* 1) Global Fusion header */
  fusion-header,
  .fusion-header-wrapper,
  #fusion-header,
  #fusion-header-left,
  #fusion-header-right,
  #fusion-header-help,
  #fusion-header-user,
  #fusion-header-theme-toggle,
  #fusion-header-alerts { display: none !important; }

  /* 2) Footer */
  react-component[name="PlmFooter"],
  #plm-footer,
  .plm-footer,
  .footer-row-wrapper { display: none !important; }

  /* 3) Item header (breadcrumbs/title/buttons) — keep the tabs that come after it */
  .itemviewer-header-container,
  #itemviewer-plm-header,
  .itemviewer-header-row2,
  #itemviewer-item-header { display: none !important; }

   /* 4) Native tabs menu (hide only inside iframe) */
  tabs-menu,
  #itemviewer-item-tabs-wrapper,
  .df-tab-menu,
  .item-tabs-bar,
  .item-tabs-more { display: none !important; }

  /* Normalize layout after chrome removal */
  html, body { height: 100% !important; }
  body { margin: 0 !important; padding: 0 !important; }
  #main, .content, .layout-column, .layout-row {
    margin-top: 0 !important;
    padding-top: 0 !important;
  }
`;

      doc.head.appendChild(style);
    };

    // Run now and also if the inner app re-hydrates quickly
    inject();
    setTimeout(inject, 200); // small retry for late-mounted headers
    setTimeout(inject, 800);
  } catch (e) {
    // Cross-origin or timing issues – ignore silently
  }
}

/* ---------------- UI build & placement ---------------- */
function buildUI(tabs) {
  const root = document.createElement("div");
  root.id = EXT_MARKER_ID;

  const bar = document.createElement("div");
  bar.className = "aw-second-tabs-bar";

  const content = document.createElement("div");
  content.className = "aw-second-tabs-content";

  tabs.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "aw-second-tab";
    btn.textContent = t.name;

    const panel = document.createElement("div");
    panel.style.display = "none";
    panel.style.width = "100%";
    panel.style.height = "100%";

    const iframe = document.createElement("iframe");
    iframe.className = "aw-second-iframe";
    iframe.src = t.url;

    // NEW: trim FM header/footer when iframe is same-tenant
    iframe.addEventListener("load", () => maybeTrimIframeChrome(iframe));

    panel.appendChild(iframe);

    btn.addEventListener("click", () => {
      const isActive = btn.classList.contains("active");

      // clear all
      bar
        .querySelectorAll(".aw-second-tab")
        .forEach((b) => b.classList.remove("active"));
      Array.from(content.children).forEach((c) => (c.style.display = "none"));
      content.classList.remove("active");

      if (!isActive) {
        btn.classList.add("active");
        panel.style.display = "block";
        content.classList.add("active");
      }
      // clicking active collapses
    });

    bar.appendChild(btn);
    content.appendChild(panel);
  });

  root.appendChild(bar);
  root.appendChild(content);
  return root;
}
const toolbar = findTabsToolbar();
const ref = toolbar?.querySelector('.item-tabs-bar') || toolbar; // native tabs line
if (toolbar && ref) {
  const offset = Math.max(0, ref.getBoundingClientRect().left - toolbar.getBoundingClientRect().left);
  ui.style.setProperty('--aw-tabs-left', `${offset}px`);
}

let injecting = false; // <— global mutex

function placeUIOnce(root) {
  const toolbar = findTabsToolbar();
  if (!toolbar) return false;

  // Already correctly placed? do nothing.
  const sib = toolbar.nextElementSibling;
  if (sib && sib.id === EXT_MARKER_ID) return true;

  // If our root exists elsewhere, move it here (don’t create another).
  const existing = rootEl();
  if (existing && existing !== root) existing.remove();

  toolbar.insertAdjacentElement("afterend", root);
  return true;
}

/* ---------------- Controller ---------------- */
async function ensureInjected() {
  if (injecting) return;           // serialize
  injecting = true;
  try {
    // Only on item pages
    if (!(location.pathname.includes("/plm/workspaces/") &&
          location.pathname.includes("/items/"))) {
      const r = rootEl(); if (r) r.remove();
      currentKey = null;
      return;
    }

    const { wsId, dmsId } = getWsAndDmsFromUrl();
    if (!wsId || !dmsId) return;

    const key = `${wsId}:${dmsId}`;
    const existing = rootEl();

    // If we already injected for this key, just ensure it’s placed correctly once.
    if (existing && currentKey === key) {
      placeUIOnce(existing);
      return;
    }

    // Switching item? remove old bar.
    if (existing && currentKey !== key) existing.remove();

    // Fetch/cached tabs
    let entry = cache.get(key);
    if (!entry) {
      try {
        const item = await fetchItem(wsId, dmsId);
        const tabs = parseTabs(item);
        entry = { tabs, fetchedAt: Date.now() };
        cache.set(key, entry);
      } catch {
        return;
      }
    }

    if (!entry.tabs.length) { currentKey = key; return; }

    // Reuse existing root if it somehow survived; else build fresh.
    const ui = rootEl() || buildUI(entry.tabs);

    if (placeUIOnce(ui)) currentKey = key;

  } finally {
    injecting = false;             // always release
  }
}


/* ---------------- Start ---------------- */
function start() {
  if (urlTick) clearInterval(urlTick);
  urlTick = setInterval(ensureInjected, 900);
  ensureInjected();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
