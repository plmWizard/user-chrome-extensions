(() => {
  const EVENT_NAME = "aw:vcs-snapshot";
  const REQUEST_EVENT = "aw:vcs-request-snapshot";

  function safeClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return null;
    }
  }

  function hasViewShape(obj) {
    if (!obj || typeof obj !== "object") return false;

    const actualView =
      obj.actualView ||
      obj.view ||
      obj.currentView ||
      obj.actualTableau ||
      null;

    const tableColumns =
      obj.tableColumns ||
      obj.columns ||
      obj.visibleColumns ||
      null;

    return !!(
      actualView &&
      Array.isArray(tableColumns) &&
      tableColumns.length &&
      (actualView.__self__ || actualView.link || actualView.self || "")
    );
  }

  function snapshotFromObj(obj) {
    const actualView = safeClone(
      obj.actualView ||
      obj.view ||
      obj.currentView ||
      obj.actualTableau ||
      null
    );

    const tableColumns = safeClone(
      obj.tableColumns ||
      obj.columns ||
      obj.visibleColumns ||
      null
    );

    if (!actualView || !Array.isArray(tableColumns) || !tableColumns.length) {
      return null;
    }

    return { actualView, tableColumns };
  }

  function searchObjectGraph(root) {
    if (!root || typeof root !== "object") return null;

    const seen = new WeakSet();
    const queue = [root];
    let steps = 0;

    while (queue.length && steps < 1200) {
      steps++;
      const cur = queue.shift();
      if (!cur || typeof cur !== "object") continue;
      if (seen.has(cur)) continue;
      seen.add(cur);

      if (hasViewShape(cur)) {
        const snap = snapshotFromObj(cur);
        if (snap) return snap;
      }

      for (const k in cur) {
        if (!Object.prototype.hasOwnProperty.call(cur, k)) continue;
        const v = cur[k];
        if (!v || typeof v !== "object") continue;
        queue.push(v);
      }
    }

    return null;
  }

  function readAngularSnapshot() {
    if (!window.angular) return null;

    const nodes = Array.from(
      document.querySelectorAll("spreadsheet, workspace-viewer, [ng-controller], [ng-if], [ng-class]")
    );

    for (const el of nodes) {
      try {
        const ngEl = window.angular.element(el);
        const scopes = [];

        if (typeof ngEl.isolateScope === "function") scopes.push(ngEl.isolateScope());
        if (typeof ngEl.scope === "function") scopes.push(ngEl.scope());

        for (const scope of scopes) {
          const snap = searchObjectGraph(scope);
          if (snap) return snap;
        }
      } catch {}
    }

    return null;
  }

  function emitSnapshot() {
    const payload = readAngularSnapshot();
    document.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: payload || null
      })
    );
  }

  document.addEventListener(REQUEST_EVENT, emitSnapshot);
  emitSnapshot();
  setInterval(emitSnapshot, 1200);
})();