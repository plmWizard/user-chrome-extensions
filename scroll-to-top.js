(() => {
  const BTN_ID = "aw-scroll-top-btn";

  async function isEnabled() {
    if (typeof window.__AW_GET_SETTING__ === "function") {
      return !!(await window.__AW_GET_SETTING__("scrollToTopButton"));
    }
    return true;
  }

  function ensureStyle() {
    if (document.getElementById("aw-scroll-top-style")) return;
    const style = document.createElement("style");
    style.id = "aw-scroll-top-style";
    style.textContent = `
      #${BTN_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483640;
        border: 0;
        border-radius: 999px;
        width: 42px;
        height: 42px;
        background: #ff8000;
        color: #fff;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        display: none;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
      }
      #${BTN_ID}.aw-show { display: block; }
    `;
    document.head.appendChild(style);
  }

  function removeButton() {
    document.getElementById(BTN_ID)?.remove();
  }

  function ensureButton() {
    let btn = document.getElementById(BTN_ID);
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.title = "Scroll to top";
    btn.textContent = "↑";
    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.body.appendChild(btn);
    return btn;
  }

  async function update() {
    const enabled = await isEnabled();
    if (!enabled) {
      removeButton();
      return;
    }

    ensureStyle();
    const btn = ensureButton();
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    btn.classList.toggle("aw-show", y > 240);
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });

  if (typeof window.__AW_ON_SETTINGS_CHANGED__ === "function") {
    window.__AW_ON_SETTINGS_CHANGED__((changes) => {
      if (changes.scrollToTopButton) update();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", update, { once: true });
  } else {
    update();
  }
})();
