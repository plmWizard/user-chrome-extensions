(() => {
  const DBG = true;
  const log = (...a) => DBG && console.log("[WS Color]", ...a);
  const warn = (...a) => DBG && console.warn("[WS Color]", ...a);
  const err = (...a) => console.error("[WS Color]", ...a);

  const LUMINANCE_WHITE_CUTOFF = 0.9;
  const FORCE_WHITE_HEX = new Set(["#ff8000", "#0696d7"]);
  const DARKEN_BG = 0.1;
  const DARKEN_INPUT = 0.2;
  const LIGHTEN_ACTIVE = 0.2;
  const DARKEN_BORDER = 0.2;
  const LIGHTEN_ITEM_BG = 0;
  const DARKEN_ITEM_MENU = 0.1;

  let lastWsId = null;
  let lastAppliedHex = null;

  async function isEnabled() {
    if (typeof window.__AW_GET_SETTING__ === "function") {
      return await window.__AW_GET_SETTING__("workspaceColors");
    }
    return true;
  }

  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  function hexNorm(hex) {
    if (!hex) return null;
    hex = hex.trim().toLowerCase();
    if (hex.startsWith("#")) hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (/^[0-9a-f]{6}$/.test(hex)) return "#" + hex;
    return null;
  }

  function hexToRgb(hex) {
    hex = hexNorm(hex);
    if (!hex) return null;
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  function relLum({ r, g, b }) {
    const srgb = [r, g, b].map((v) => v / 255);
    const lin = srgb.map((v) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    );
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
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

  function rgbToHex({ r, g, b }) {
    const to2 = (v) => v.toString(16).padStart(2, "0");
    return "#" + to2(r) + to2(g) + to2(b);
  }

  function shiftLightness(hex, delta) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const hsl = rgbToHsl(rgb);
    hsl.l = clamp01(hsl.l + delta);
    return rgbToHex(hslToRgb(hsl));
  }

  function isWhiteText(hex) {
    const norm = hexNorm(hex);
    if (!norm) return true;
    if (FORCE_WHITE_HEX.has(norm)) return true;
    const lum = relLum(hexToRgb(norm));
    return lum <= LUMINANCE_WHITE_CUTOFF;
  }

  function getWorkspaceIdFromUrl() {
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
    if (!res.ok) throw new Error(`WS ${wsId} fetch failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  function pickHexFromDescription(desc) {
    if (!desc || typeof desc !== "string") return null;
    const m = desc.match(/\{\s*color\s*:\s*(#[0-9a-fA-F]{3,6})\s*\}/);
    return m ? hexNorm(m[1]) : null;
  }

  function setVarsOn(el, map) {
    if (!el) return;
    for (const [k, v] of Object.entries(map)) {
      el.style.setProperty(k, v);
    }
  }

  function clearAppliedStyles() {
    const vars = [
      "--item-bg",
      "--item-menu",
      "--bg-menu",
      "--tab-text-color",
      "--color-bg",
      "--bg-input",
      "--button-color-text",
      "--button-active",
      "--button-active-bg",
      "--button-hover-border-color"
    ];

    [document.documentElement, document.body].forEach((el) => {
      if (!el) return;
      vars.forEach((v) => el.style.removeProperty(v));
    });

    [
      "aw-wscolor-style",
      "aw-wscolor-mui-contained",
      "aw-wscolor-workflow-state-current"
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    lastAppliedHex = null;
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
    const tabTextColor = itemMenu;

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

    const hosts = new Set([
      document.documentElement,
      document.body,
      ...document.querySelectorAll("[data-theme], #root, .root, .app-root, .fl-root")
    ]);
    hosts.forEach((el) => setVarsOn(el, vars));

    let tag = document.getElementById("aw-wscolor-style");
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
      tag.id = "aw-wscolor-style";
      document.head.appendChild(tag);
    }
    tag.textContent = css;

    let mui = document.getElementById("aw-wscolor-mui-contained");
    if (!mui) {
      mui = document.createElement("style");
      mui.id = "aw-wscolor-mui-contained";
      document.head.appendChild(mui);
    }
    mui.textContent = `
.css-kfcjdq.MuiButton-contained {
  background-color: var(--item-bg) !important;
  border-color: var(--bg-menu) !important;
  color: var(--button-color-text) !important;
}
.MuiButton-root.MuiButton-contained,
button.MuiButton-contained,
[class*="MuiButton-contained"] {
  background-color: var(--item-bg) !important;
  border-color: var(--bg-menu) !important;
  color: var(--button-color-text) !important;
  background-image: none !important;
}
.MuiButton-contained:hover {
  background-color: var(--button-active) !important;
  border-color: var(--bg-menu) !important;
}
.MuiButton-contained.Mui-disabled {
  opacity: 0.6 !important;
  pointer-events: none !important;
}
`;

    let wf = document.getElementById("aw-wscolor-workflow-state-current");
    if (!wf) {
      wf = document.createElement("style");
      wf.id = "aw-wscolor-workflow-state-current";
      document.head.appendChild(wf);
    }
    wf.textContent = `
#workflow-actions-container .workflow-state.workflow-state-current {
  background-color: var(--button-active) !important;
  background: var(--button-active) !important;
}
`;

    lastAppliedHex = baseHex;
    log("Applied base:", baseHex);
  }

  const mo = new MutationObserver(async () => {
    if (!(await isEnabled())) return;
    if (lastAppliedHex) applyColorVariables(lastAppliedHex);
  });

  mo.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ["class", "data-theme"],
  });

  async function runOnce() {
    if (!(await isEnabled())) {
      clearAppliedStyles();
      return;
    }

    const wsId = getWorkspaceIdFromUrl();
    if (!wsId) {
      warn("No workspace in URL");
      return;
    }

    if (wsId === lastWsId && lastAppliedHex) {
      return;
    }
    lastWsId = wsId;

    try {
      const ws = await fetchWorkspace(wsId);
      const baseHex = pickHexFromDescription(ws?.description) || "#06402B";
      applyColorVariables(baseHex);
    } catch (e) {
      err(e);
    }
  }

  let prevUrl = location.href;
  setInterval(() => {
    if (location.href !== prevUrl) {
      prevUrl = location.href;
      runOnce();
    }
  }, 600);

  if (typeof window.__AW_ON_SETTINGS_CHANGED__ === "function") {
    window.__AW_ON_SETTINGS_CHANGED__((changes) => {
      if (changes.workspaceColors) {
        if (changes.workspaceColors.newValue) runOnce();
        else clearAppliedStyles();
      }
    });
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", runOnce, { once: true })
    : runOnce();
})();