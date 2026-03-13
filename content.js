// === Fusion Manage "Second Tabs" with settings support ===
(() => {
  const EXT_MARKER_ID = "aw-second-tabs-root";
  let currentKey = null;
  let cache = new Map();
  let urlTick = null;
  let injecting = false;

  function rootEl() {
    return document.getElementById(EXT_MARKER_ID);
  }

  async function isEnabled() {
    if (typeof window.__AW_GET_SETTING__ === "function") {
      return await window.__AW_GET_SETTING__("secondTabs");
    }
    return true;
  }

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
      } catch {}
    }
    if (!dmsId) {
      const alt = href.match(/\/items\/(\d+)(?:[/?#]|$)/i);
      if (alt) dmsId = alt[1];
    }
    return { wsId, dmsId };
  }

  async function fetchItem(wsId, dmsId) {
    const url = `/api/v3/workspaces/${wsId}/items/${dmsId}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`Item fetch failed ${res.status}`);
    return res.json();
  }

  function parseTabs(itemJson) {
    const section = (itemJson?.sections || []).find(
      (s) => String(s.title || "").trim().toLowerCase() === "tab row"
    );
    if (!section) return [];

    const map = new Map();
    (section.fields || []).forEach((f) => {
      map.set(String(f.title || "").trim().toLowerCase(), f);
    });

    const tabs = [];
    for (let i = 1; i <= 15; i++) {
      const name = map.get(`tab name ${i}`)?.value?.toString().trim() || "";
      const url = map.get(`url tab ${i}`)?.value?.toString().trim() || "";
      if (name && url) tabs.push({ name, url });
    }
    return tabs;
  }

  function findTabsToolbar() {
    const menus = document.querySelectorAll("tabs-menu");
    let menu = null;
    for (const m of menus) {
      if (m.offsetParent !== null) {
        menu = m;
        break;
      }
    }
    if (!menu) return null;
    const toolbar = menu.closest("md-toolbar, .md-toolbar");
    return toolbar || menu;
  }

  function syncTabOffset(root) {
    const toolbar = findTabsToolbar();
    if (!toolbar || !root) return;

    const ref =
      toolbar.querySelector(".item-tabs-bar") ||
      toolbar.querySelector("tabs-menu") ||
      toolbar;

    const offset = Math.max(
      0,
      ref.getBoundingClientRect().left - toolbar.getBoundingClientRect().left
    );

    root.style.setProperty("--aw-tabs-left", `${offset}px`);
  }

  function maybeTrimIframeChrome(iframe) {
    try {
      const srcHost = new URL(iframe.src, location.origin).host;
      if (srcHost !== location.host) return;

      const inject = () => {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc || !doc.head) return;
        if (doc.getElementById("__aw_trim_style")) return;

        const style = doc.createElement("style");
        style.id = "__aw_trim_style";
        style.textContent = `
fusion-header,
.fusion-header-wrapper,
#fusion-header,
#fusion-header-left,
#fusion-header-right,
#fusion-header-help,
#fusion-header-user,
#fusion-header-theme-toggle,
#fusion-header-alerts { display: none !important; }

react-component[name="PlmFooter"],
#plm-footer,
.plm-footer,
.footer-row-wrapper { display: none !important; }

.itemviewer-header-container,
#itemviewer-plm-header,
.itemviewer-header-row2,
#itemviewer-item-header { display: none !important; }

tabs-menu,
#itemviewer-item-tabs-wrapper,
.df-tab-menu,
.item-tabs-bar,
.item-tabs-more { display: none !important; }

html, body { height: 100% !important; }
body { margin: 0 !important; padding: 0 !important; }
#main, .content, .layout-column, .layout-row {
  margin-top: 0 !important;
  padding-top: 0 !important;
}
`;
        doc.head.appendChild(style);
      };

      inject();
      setTimeout(inject, 200);
      setTimeout(inject, 800);
    } catch {}
  }

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
      iframe.addEventListener("load", () => maybeTrimIframeChrome(iframe));

      panel.appendChild(iframe);

      btn.addEventListener("click", () => {
        const isActive = btn.classList.contains("active");

        bar.querySelectorAll(".aw-second-tab").forEach((b) => b.classList.remove("active"));
        Array.from(content.children).forEach((c) => (c.style.display = "none"));
        content.classList.remove("active");

        if (!isActive) {
          btn.classList.add("active");
          panel.style.display = "block";
          content.classList.add("active");
        }
      });

      bar.appendChild(btn);
      content.appendChild(panel);
    });

    root.appendChild(bar);
    root.appendChild(content);
    return root;
  }

  function placeUIOnce(root) {
    const toolbar = findTabsToolbar();
    if (!toolbar) return false;

    const sib = toolbar.nextElementSibling;
    if (sib && sib.id === EXT_MARKER_ID) {
      syncTabOffset(sib);
      return true;
    }

    const existing = rootEl();
    if (existing && existing !== root) existing.remove();

    toolbar.insertAdjacentElement("afterend", root);
    syncTabOffset(root);
    return true;
  }

  async function ensureInjected() {
    if (injecting) return;
    injecting = true;

    try {
      const enabled = await isEnabled();
      if (!enabled) {
        const r = rootEl();
        if (r) r.remove();
        currentKey = null;
        return;
      }

      if (
        !(
          location.pathname.includes("/plm/workspaces/") &&
          location.pathname.includes("/items/")
        )
      ) {
        const r = rootEl();
        if (r) r.remove();
        currentKey = null;
        return;
      }

      const { wsId, dmsId } = getWsAndDmsFromUrl();
      if (!wsId || !dmsId) return;

      const key = `${wsId}:${dmsId}`;
      const existing = rootEl();

      if (existing && currentKey === key) {
        placeUIOnce(existing);
        return;
      }

      if (existing && currentKey !== key) existing.remove();

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

      if (!entry.tabs.length) {
        currentKey = key;
        return;
      }

      const ui = rootEl() || buildUI(entry.tabs);
      if (placeUIOnce(ui)) currentKey = key;
    } finally {
      injecting = false;
    }
  }

  function start() {
    if (urlTick) clearInterval(urlTick);
    urlTick = setInterval(ensureInjected, 900);
    ensureInjected();

    if (typeof window.__AW_ON_SETTINGS_CHANGED__ === "function") {
      window.__AW_ON_SETTINGS_CHANGED__((changes) => {
        if (changes.secondTabs) {
          ensureInjected();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();