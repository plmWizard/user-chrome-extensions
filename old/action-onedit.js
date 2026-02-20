async function injectOnce() {
  const { wsId, dmsId } = getWsAndDmsFromUrl();
  const tab = currentTabToken();
  if (!wsId || !dmsId || !tab) return;

  const key = `${wsId}:${dmsId}:${tab}`;
  if (key === lastKey && document.getElementById(HOST_ID_PREFIX + tab)) {
    // ... existing disabled-state refresh ...
    return;
  }
  lastKey = key;

  try {
    const data = await fetchScripts(wsId, dmsId);

    // NEW ⬇ Publish to window so the onEdit module can match & run
    (function publishScriptsForOnEdit() {
      if (!data || !Array.isArray(data.scripts)) return;
      const allScriptsArray = data.scripts.map(s => ({
        id: s.__self__,
        name: s.displayName || s.uniqueName || "Unnamed",
      }));
      window.__AW_ACTION_SCRIPTS = allScriptsArray;
      if (typeof window.__AW_RUN_SCRIPT !== "function") {
        window.__AW_RUN_SCRIPT = async function (scriptObj) {
          return runScriptByVariants(scriptObj.id);
        };
      }
      try {
        window.dispatchEvent(new CustomEvent("aw:scripts-ready", {
          detail: { scripts: allScriptsArray, context: { wsId, dmsId } }
        }));
      } catch {}
    })();
    // NEW ⬆

    const actions = extractActionsForTab(data, tab);
    if (actions.length === 0) return;

    const edit = isEditMode();
    ensureStyles();
    mountButtonsForTab(tab, actions, { disabled: edit });
  } catch (e) {
    // console.debug("[FM Action Buttons] skip:", e);
  }
}
