(() => {
  const MOD = "[AW Logo Override]";
  const IMG_SELECTOR = ".brand-logo img.manage-360-branding";
  const LINK_SELECTOR = ".brand-logo a[href='mainDashboard'], .brand-logo a";

  let lastAppliedLogoUrl = null;
  let lastAppliedClickUrl = null;
  let observer = null;
  let tick = null;

  async function getSettings() {
    if (typeof window.__AW_GET_SETTINGS__ === "function") {
      return await window.__AW_GET_SETTINGS__();
    }
    return {
      customLogoUrl: "",
      customLogoClickUrl: ""
    };
  }

  function isValidHttpUrl(value) {
    if (!value || typeof value !== "string") return false;
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function getLogoImg() {
    return document.querySelector(IMG_SELECTOR);
  }

  function getLogoLink() {
    return document.querySelector(LINK_SELECTOR);
  }

  function cleanupIfNeeded() {
    const img = getLogoImg();
    const link = getLogoLink();

    if (img && img.dataset.awOriginalSrc && img.dataset.awLogoOverridden === "1") {
      img.src = img.dataset.awOriginalSrc;
      img.style.removeProperty("max-height");
      img.style.removeProperty("height");
      img.style.removeProperty("width");
      img.style.removeProperty("object-fit");
      img.removeAttribute("data-aw-logo-overridden");
    }

    if (link && link.dataset.awOriginalHref && link.dataset.awClickOverridden === "1") {
      link.setAttribute("href", link.dataset.awOriginalHref);
      link.removeAttribute("data-aw-click-overridden");
      link.removeAttribute("target");
      link.removeAttribute("rel");
    }

    lastAppliedLogoUrl = null;
    lastAppliedClickUrl = null;
  }

  function applyLogo(logoUrl, clickUrl) {
    const img = getLogoImg();
    const link = getLogoLink();

    if (!img) return false;

    if (!img.dataset.awOriginalSrc) {
      img.dataset.awOriginalSrc = img.getAttribute("src") || "";
    }

    if (link && !link.dataset.awOriginalHref) {
      link.dataset.awOriginalHref = link.getAttribute("href") || "";
    }

    if (logoUrl && img.src !== logoUrl) {
      img.src = logoUrl;
      img.dataset.awLogoOverridden = "1";

      img.style.maxHeight = "32px";
      img.style.height = "32px";
      img.style.width = "auto";
      img.style.objectFit = "contain";
    }

    if (link) {
      if (clickUrl) {
        link.setAttribute("href", clickUrl);
        link.dataset.awClickOverridden = "1";
      } else if (link.dataset.awOriginalHref) {
        link.setAttribute("href", link.dataset.awOriginalHref);
        link.removeAttribute("data-aw-click-overridden");
        link.removeAttribute("target");
        link.removeAttribute("rel");
      }
    }

    lastAppliedLogoUrl = logoUrl || null;
    lastAppliedClickUrl = clickUrl || null;
    return true;
  }

  async function run() {
    const settings = await getSettings();
    const logoUrl = (settings.customLogoUrl || "").trim();
    const clickUrl = (settings.customLogoClickUrl || "").trim();

    if (!logoUrl) {
      cleanupIfNeeded();
      return;
    }

    if (!isValidHttpUrl(logoUrl)) {
      console.warn(MOD, "customLogoUrl is not a valid http/https URL");
      cleanupIfNeeded();
      return;
    }

    const validClickUrl = isValidHttpUrl(clickUrl) ? clickUrl : "";

    const img = getLogoImg();
    if (!img) return;

    const alreadyApplied =
      lastAppliedLogoUrl === logoUrl &&
      lastAppliedClickUrl === (validClickUrl || null) &&
      img.dataset.awLogoOverridden === "1";

    if (alreadyApplied) return;

    applyLogo(logoUrl, validClickUrl);
  }

  function startObservers() {
    if (!observer) {
      observer = new MutationObserver(() => {
        run();
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false
      });
    }

    if (!tick) {
      tick = setInterval(run, 1000);
    }

    if (typeof window.__AW_ON_SETTINGS_CHANGED__ === "function") {
      window.__AW_ON_SETTINGS_CHANGED__((changes) => {
        if (changes.customLogoUrl || changes.customLogoClickUrl) {
          run();
        }
      });
    }
  }
  

  function start() {
    startObservers();
    run();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();