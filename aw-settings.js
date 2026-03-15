(() => {
  const DEFAULTS = {
    secondTabs: true,
    actionButtons: true,
    onEditRunner: true,
    workspaceColors: true,
    customLogoUrl: "",
    customLogoClickUrl: "",
    searchOverlay: true
  };

  if (window.__AW_SETTINGS_READY__) return;
  window.__AW_SETTINGS_READY__ = true;

  function getApi() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync
      ? chrome.storage.sync
      : null;
  }

  async function getSettings() {
    const api = getApi();
    if (!api) return { ...DEFAULTS };

    return new Promise((resolve) => {
      try {
        api.get(DEFAULTS, (result) => {
          resolve({ ...DEFAULTS, ...(result || {}) });
        });
      } catch {
        resolve({ ...DEFAULTS });
      }
    });
  }

  async function getSetting(key) {
    const settings = await getSettings();
    return settings[key];
  }

  function onSettingsChanged(cb) {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.onChanged
    ) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        cb(changes);
      });
    }
  }

  window.__AW_DEFAULT_SETTINGS__ = DEFAULTS;
  window.__AW_GET_SETTINGS__ = getSettings;
  window.__AW_GET_SETTING__ = getSetting;
  window.__AW_ON_SETTINGS_CHANGED__ = onSettingsChanged;
})();
