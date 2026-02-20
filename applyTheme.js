(function () {
  const STORAGE_KEY = "enableDarkGreenTheme";

  function shouldEnableTheme(settings) {
    return settings?.[STORAGE_KEY] !== false;
  }

  function ensureDarkMarker(doc) {
    if (!doc?.body) return;
    let marker = doc.getElementById("addwize-dark-marker");
    if (!marker) {
      marker = doc.createElement("div");
      marker.id = "addwize-dark-marker";
      marker.setAttribute("data-theme", "dark");     // triggers body:has([data-theme="dark"])
      marker.style.display = "none";
      doc.body.appendChild(marker);
    }
  }

  function setThemeAttr(doc, enable) {
    const root = doc?.documentElement;
    if (!root) return;
    if (enable) root.setAttribute("data-addwize-theme", "dark-green");
    else root.removeAttribute("data-addwize-theme");
  }

  function applyToDocument(doc) {
    if (!doc) return;
    ensureDarkMarker(doc);
    setThemeAttr(doc, true);
  }

  function removeFromDocument(doc) {
    if (!doc) return;
    setThemeAttr(doc, false);
    const marker = doc.getElementById("addwize-dark-marker");
    if (marker && marker.parentNode) marker.parentNode.removeChild(marker);
  }

  function applyEverywhere(win) {
    try {
      applyToDocument(win.document);
    } catch {}
    // recurse into same-origin iframes
    const frames = win.document.querySelectorAll("iframe");
    frames.forEach((f) => {
      const onReady = () => {
        try { applyEverywhere(f.contentWindow); } catch {}
      };
      if (f.contentWindow?.document?.readyState === "complete") onReady();
      else f.addEventListener("load", onReady, { once: true });
    });
  }

  // init
  new Promise((resolve) => {
    try { chrome.storage.sync.get([STORAGE_KEY], resolve); }
    catch { resolve({}); }
  }).then((settings) => {
    if (shouldEnableTheme(settings)) applyEverywhere(window);

    // Observe DOM for SPA/iframe changes in this document
    const obs = new MutationObserver(() => {
      if (shouldEnableTheme(settings)) applyEverywhere(window);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    // React to toggle changes
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes[STORAGE_KEY]) return;
        const enabled = changes[STORAGE_KEY].newValue !== false;
        if (enabled) applyEverywhere(window);
        else removeFromDocument(document);
      });
    } catch {}
  });
})();
