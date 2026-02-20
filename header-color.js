// == Color from Workspace Description =======================================
// Reads {color: #RRGGBB} from /api/v2/workspaces/{wsId}.description and
// sets Fusion Manage theme variables dynamically.
//
// Sets:
//  --item-bg
//  --item-menu
//  --tab-text-color
//  --color-bg            (darker tone)
//  --bg-input            (darker tone)
//  --button-color-text   (white/black based on contrast)
//  --button-active       (derived from base color)
//  --button-hover-border-color (derived from base color)
//
// Save as: color-from-workspace.js
// Load on all FM pages that show items/tabs. Runs on navigation changes too.
(() => {
  const DBG = true;
  const log = (...a) => DBG && console.log("[WS Color]", ...a);
  const warn = (...a) => DBG && console.warn("[WS Color]", ...a);
  const err = (...a) => console.error("[WS Color]", ...a);

  // --- Tunables -------------------------------------------------------------

  // Contrast cutoff for deciding white vs black text (0 = dark, 1 = bright).
  // You can tweak this if you want "more white text".
  const LUMINANCE_WHITE_CUTOFF = 0.9;

  // Force white text for specific brand colors even if they’re "light".
  const FORCE_WHITE_HEX = new Set([
    "#ff8000", // your example
    "#0696d7", // your example
  ]);

  // How much to darken for "darker tones"
  const DARKEN_BG = 0.1; //
  const DARKEN_INPUT = 0.2;

  // Button derivations
  const LIGHTEN_ACTIVE = 0.2; // 20% lighter than base for --button-active
  const DARKEN_BORDER = 0.2; // 20% darker than base for --button-hover-border-color

  // Slight separation between item-bg and item-menu for depth
  const LIGHTEN_ITEM_BG = 0; // item-bg is base lightened 12%
  const DARKEN_ITEM_MENU = 0.1; // item-menu is base darkened 18%

  // Cache to avoid refetching on same workspace
  let lastWsId = null;
  let lastAppliedHex = null;

  // --- Utilities ------------------------------------------------------------

  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  function hexNorm(hex) {
    if (!hex) return null;
    hex = hex.trim().toLowerCase();
    if (hex.startsWith("#")) hex = hex.slice(1);
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    if (/^[0-9a-f]{6}$/.test(hex)) return "#" + hex;
    return null;
  }

  function hexToRgb(hex) {
    hex = hexNorm(hex);
    if (!hex) return null;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  // relative luminance (WCAG)
  function relLum({ r, g, b }) {
    const srgb = [r, g, b].map((v) => v / 255);
    const lin = srgb.map((v) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    );
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  // lighten/darken via HSL lightness shift
  function rgbToHsl({ r, g, b }) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return { h, s, l };
  }

  function hslToRgb({ h, s, l }) {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  function shiftLightness(hex, delta /* -1..+1 */) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const hsl = rgbToHsl(rgb);
    hsl.l = clamp01(hsl.l + delta);
    const out = hslToRgb(hsl);
    return rgbToHex(out);
  }

  function rgbToHex({ r, g, b }) {
    const to2 = (v) => v.toString(16).padStart(2, "0");
    return "#" + to2(r) + to2(g) + to2(b);
  }

  function isWhiteText(hex) {
    const norm = hexNorm(hex);
    if (!norm) return true;
    if (FORCE_WHITE_HEX.has(norm)) return true;
    const lum = relLum(hexToRgb(norm));
    return lum <= LUMINANCE_WHITE_CUTOFF; // brighter backgrounds -> white text
  }

  // --- Workspace / URL helpers ---------------------------------------------

  function getWorkspaceIdFromUrl() {
    // examples:
    // .../workspaces/1994/items/22593...
    // .../workspaces/1994...
    const m = location.href.match(/\/workspaces\/(\d+)/i);
    return m ? m[1] : null;
  }

  async function fetchWorkspace(wsId) {
    const url = `/api/v2/workspaces/${wsId}`;
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!res.ok)
      throw new Error(
        `WS ${wsId} fetch failed: ${res.status} ${res.statusText}`
      );
    return res.json();
  }

  function pickHexFromDescription(desc) {
    if (!desc || typeof desc !== "string") return null;
    // supports "{color: #00ff80}" (spaces optional, case-insensitive)
    const m = desc.match(/\{\s*color\s*:\s*(#[0-9a-fA-F]{3,6})\s*\}/);
    return m ? hexNorm(m[1]) : null;
  }

  // --- Apply Variables ------------------------------------------------------

  function setVarsOn(el, map) {
    if (!el) return;
    for (const [k, v] of Object.entries(map)) el.style.setProperty(k, v);
  }

  function applyColorVariables(baseHex) {
    const itemBg = shiftLightness(baseHex, +LIGHTEN_ITEM_BG) || baseHex;
    const itemMenu = shiftLightness(baseHex, -DARKEN_ITEM_MENU) || baseHex;
    const colorBg = shiftLightness(baseHex, -DARKEN_BG) || baseHex;
    const bgInput = shiftLightness(baseHex, -DARKEN_INPUT) || baseHex;
    const active = shiftLightness(baseHex, +LIGHTEN_ACTIVE) || baseHex;
    const hoverBord = shiftLightness(baseHex, -DARKEN_BORDER) || baseHex;

    const whiteText = isWhiteText(baseHex);
    const textColor = whiteText ? "#ffffff" : "#000000";
    const tabTextColor = itemMenu;/*!isWhiteText(itemMenu) ? "#ffffff" : "#000000";*/

    const vars = {
      "--item-bg": itemBg,
      "--item-menu": itemMenu,
      "--bg-menu": itemBg,
      "--tab-text-color": tabTextColor,
      "--color-bg": colorBg,
      "--bg-input": bgInput,
      "--button-color-text": textColor,
      "--button-active": active,
      "--button-active-bg": itemBg,
      "--button-hover-border-color": hoverBord,
    };

    (function ensureMuiContainedBtnColors() {
  const id = "aw-wscolor-mui-contained";
  let tag = document.getElementById(id);
  if (!tag) {
    tag = document.createElement("style");
    tag.id = id;
    document.head.appendChild(tag);
  }
  tag.textContent = `
.css-kfcjdq.MuiButton-contained {
  background-color: var(--item-bg) !important;
  border-color: var(--bg-menu) !important;
  color: var(--button-color-text) !important;
}

/* Stable selectors — prefer these */
.MuiButton-root.MuiButton-contained,
button.MuiButton-contained,
[class*="MuiButton-contained"] {
  background-color: var(--item-bg) !important;
  border-color: var(--bg-menu) !important;
  color: var(--button-color-text) !important;
  background-image: none !important;
}

/* Hover/active */
.MuiButton-contained:hover {
  background-color: var(--button-active) !important;
  border-color: var(--bg-menu) !important;
}

/* Disabled */
.MuiButton-contained.Mui-disabled {
  opacity: 0.6 !important;
  pointer-events: none !important;
}
`;
})();
(function ensureWorkflowStateCurrentColor() {
  const id = "aw-wscolor-workflow-state-current";
  let tag = document.getElementById(id);
  if (!tag) {
    tag = document.createElement("style");
    tag.id = id;
    document.head.appendChild(tag);
  }
  tag.textContent = `
/* Current workflow state chip */
#workflow-actions-container .workflow-state.workflow-state-current {
  background-color: var(--button-active) !important;
  background: var(--button-active) !important;
}
`;
})();


    // Apply to all likely hosts (proximity beats :root in CSS vars)
    const hosts = new Set([
      document.documentElement,
      document.body,
      ...document.querySelectorAll(
        "[data-theme], [data-theme] *:host, #root, .root, .app-root, .fl-root"
      ),
    ]);
    hosts.forEach((el) => setVarsOn(el, vars));

    // Extra belt & braces: keep a <style> synced so late CSS doesn’t stomp values
    const id = "aw-wscolor-style";
    let tag = document.getElementById(id);
    const css = `
:root, body, [data-theme], #root, .root, .app-root, .fl-root {
  --item-bg: ${itemBg};
  --item-menu: ${itemMenu};
  --tab-text-color: ${tabTextColor};
  --color-bg: ${colorBg};
  --bg-input: ${bgInput};
  --button-color-text: ${textColor};
  --button-active: ${active};
  --button-hover-border-color: ${hoverBord};
}`;
    if (!tag) {
      tag = document.createElement("style");
      tag.id = id;
      document.head.appendChild(tag);
    }
    tag.textContent = css;

    lastAppliedHex = baseHex;
    log("Applied base:", baseHex, {
      itemBg,
      itemMenu,
      colorBg,
      bgInput,
      tabTextColor,
      textColor,
      active,
      hoverBord,
    });
  }

  // Observe theme/host changes so FM SPA updates don’t revert the vars
  const mo = new MutationObserver(() => {
    if (lastAppliedHex) applyColorVariables(lastAppliedHex);
  });
  mo.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ["class", "data-theme"],
  });

  async function runOnce() {
    const wsId = getWorkspaceIdFromUrl();
    if (!wsId) {
      warn("No workspace in URL");
      return;
    }
    if (wsId === lastWsId && lastAppliedHex) {
      log("Same workspace; color already applied:", wsId, lastAppliedHex);
      return;
    }
    lastWsId = wsId;

    try {
      const ws = await fetchWorkspace(wsId);
      const baseHex = pickHexFromDescription(ws?.description) || "#06402B";
      if (!baseHex) {
        warn(
          `Workspace ${wsId} has no {color: #...} in description. Skipping.`
        );
        return;
      }
      applyColorVariables(baseHex);
    } catch (e) {
      err(e);
    }
  }

  // --- Re-run on navigation -------------------------------------------------
  // Fusion Manage is SPA-like; observe URL changes and re-run.
  let prevUrl = location.href;
  setInterval(() => {
    if (location.href !== prevUrl) {
      prevUrl = location.href;
      runOnce();
    }
  }, 600);

  // Initial
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", runOnce, { once: true })
    : runOnce();
})();
