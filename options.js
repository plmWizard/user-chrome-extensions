const DEFAULTS = {
  secondTabs: true,
  actionButtons: true,
  onEditRunner: true,
  workspaceColors: true,
  customLogoUrl: "",
  customLogoClickUrl: "",
  searchOverlay: true,
  itemContextBadge: true,
  scrollToTopButton: true
};

const ids = Object.keys(DEFAULTS);
const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg || "";
  clearTimeout(setStatus._t);
  setStatus._t = setTimeout(() => {
    statusEl.textContent = "";
  }, 1600);
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (settings) => {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      if (el.type === "checkbox") {
        el.checked = !!settings[id];
      } else {
        el.value = settings[id] || "";
      }
    });
  });
}

function save(key, value) {
  chrome.storage.sync.set({ [key]: value }, () => {
    setStatus("Saved");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  load();

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    const evt = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(evt, () => {
      const value = el.type === "checkbox" ? el.checked : el.value.trim();
      save(id, value);
    });
  });
});