(() => {
  const ROOT_ID = "aw-item-context-badge";

  async function isEnabled() {
    if (typeof window.__AW_GET_SETTING__ === "function") {
      return !!(await window.__AW_GET_SETTING__("itemContextBadge"));
    }
    return true;
  }

  function getItemContext() {
    const href = location.href;
    const wsMatch = href.match(/\/plm\/workspaces\/(\d+)\/items\//i);
    const wsId = wsMatch ? wsMatch[1] : null;

    let itemId = null;
    const itemParam = new URLSearchParams(location.search).get("itemId");
    if (itemParam) {
      try {
        const decoded = decodeURIComponent(itemParam);
        const match =
          decoded.match(/[,`.](\d+)[,`.](\d+)\s*$/) ||
          decoded.match(/(\d+)[,`.](\d+)\s*$/);
        if (match) itemId = match[2];
      } catch {}
    }

    if (!itemId) {
      const fallback = href.match(/\/items\/(\d+)(?:[/?#]|$)/i);
      if (fallback) itemId = fallback[1];
    }

    return { wsId, itemId };
  }

  function removeBadge() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
  }

  function ensureStyle() {
    if (document.getElementById("aw-item-context-badge-style")) return;
    const style = document.createElement("style");
    style.id = "aw-item-context-badge-style";
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        right: 14px;
        top: 78px;
        z-index: 2147483640;
        background: rgba(20, 27, 34, 0.95);
        border: 1px solid rgba(255, 128, 0, 0.45);
        color: #ecf2f8;
        border-radius: 10px;
        font: 12px/1.2 system-ui, sans-serif;
        padding: 8px 10px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
      }
      #${ROOT_ID} .aw-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
      #${ROOT_ID} .aw-row:last-child { margin-bottom: 0; }
      #${ROOT_ID} .aw-key { color: #9fb1c3; min-width: 24px; }
      #${ROOT_ID} button {
        border: 1px solid rgba(255, 128, 0, 0.6);
        background: #ff8000;
        color: #fff;
        border-radius: 8px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 11px;
      }
    `;
    document.head.appendChild(style);
  }

  function createBadge({ wsId, itemId }) {
    const root = document.createElement("div");
    root.id = ROOT_ID;

    const line1 = document.createElement("div");
    line1.className = "aw-row";
    line1.innerHTML = `<span class="aw-key">WS</span><strong>${wsId}</strong>`;

    const line2 = document.createElement("div");
    line2.className = "aw-row";
    line2.innerHTML = `<span class="aw-key">ITEM</span><strong>${itemId}</strong>`;

    const actions = document.createElement("div");
    actions.className = "aw-row";

    const copyId = document.createElement("button");
    copyId.type = "button";
    copyId.textContent = "Copy item ID";
    copyId.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(itemId));
        copyId.textContent = "Copied";
        setTimeout(() => (copyId.textContent = "Copy item ID"), 1200);
      } catch {}
    });

    actions.appendChild(copyId);
    root.append(line1, line2, actions);
    return root;
  }

  async function render() {
    if (!(await isEnabled())) {
      removeBadge();
      return;
    }

    const { wsId, itemId } = getItemContext();
    if (!wsId || !itemId) {
      removeBadge();
      return;
    }

    ensureStyle();

    const current = document.getElementById(ROOT_ID);
    if (current) {
      const data = `${wsId}:${itemId}`;
      if (current.dataset.awKey === data) return;
      current.remove();
    }

    const badge = createBadge({ wsId, itemId });
    badge.dataset.awKey = `${wsId}:${itemId}`;
    document.body.appendChild(badge);
  }

  let prevHref = location.href;
  setInterval(() => {
    if (location.href !== prevHref) {
      prevHref = location.href;
      render();
      return;
    }
    if (document.getElementById(ROOT_ID)) return;
    render();
  }, 700);

  if (typeof window.__AW_ON_SETTINGS_CHANGED__ === "function") {
    window.__AW_ON_SETTINGS_CHANGED__((changes) => {
      if (changes.itemContextBadge) render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();
