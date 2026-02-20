(async function () {
  let scripts = [];
  let lastWorkspaceId = null;
  let lastItemId = null;
  let currentUrl = location.href;
  const language = navigator.language.slice(0, 2);
  var socket;

  const settings = await new Promise((resolve) => {
    chrome.storage.sync.get(
      [
        "enableRemoveActions",
        "enableScriptButtons",
        "enableProxyServerButton",
        "enableTranslation",
      ],
      resolve
    );
  });

  function should(key) {
    return settings[key] !== false;
  }

  async function initializeExtension() {
    translationEnabled = should("enableTranslation");
    console.log();

    const url = window.location.href;
    if (url.includes("mode=edit") && translationEnabled == true) {
      window.location.href = url.replace("mode=edit", "mode=view");
    }

    console.log("Initializing Extension");
    const { workspaceId, itemId } = getWorkspaceAndItemId();
    if (!workspaceId || !itemId) return;
    if (workspaceId === lastWorkspaceId && itemId === lastItemId) return;

    lastWorkspaceId = workspaceId;
    lastItemId = itemId;

    await waitForElement("#itemviewer-item-header");
    initTranslation();

    await fetchAvailableScripts(workspaceId, itemId);
    if (should("enableScriptButtons"))
      injectScriptButtons(), injectNotificationsScript(), injectFontAwesome();
    if (should("enableRemoveActions"))
      setTimeout(removeAdditionalActionsDropdownItem, 1000);
    if (should("enableStandartActionButtons")) injectFontAwesome();
  }

  async function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const interval = 100;
      const maxAttempts = timeout / interval;
      let attempts = 0;
      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (++attempts > maxAttempts) return reject();
        setTimeout(check, interval);
      };
      check();
    });
  }

  function injectNotificationsScript() {
    if (document.getElementById("extension-notifications-script")) return;
    const script = document.createElement("script");
    script.id = "extension-notifications-script";
    script.src = chrome.runtime.getURL("injectedScriptForNotifications.js");
    script.onload = () => {
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function injectScriptButtons() {
    const itemHeader = document.querySelector("#itemviewer-item-header");
    if (!itemHeader || document.querySelector("#script-buttons-container"))
      return;
    const { outer, inner } = createButtonContainer();
    scripts.forEach((script) => inner.appendChild(createButton(script)));
    itemHeader.appendChild(outer);
  }

  function removeAdditionalActionsDropdownItem() {
    const observer = new MutationObserver(() => tryRemove());
    function tryRemove() {
      const menus = document.querySelectorAll('ul[role="menu"]');
      for (const menu of menus) {
        const items = menu.querySelectorAll("li");
        for (const li of items) {
          const label = li.querySelector("span")?.textContent?.trim();
          var labelName = "";
          switch (navigator.language.slice(0, 2)) {
            case "en":
              labelName = "Additional Actions";
              break;
            case "de":
              labelName = "Zusätzliche Aktionen";
              break;
            case "it":
              labelName = "Ulteriori azioni";
              break;
          }
          if (label === labelName) {
            li.remove();
          }
        }
      }
    }
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function fetchAvailableScripts(workspaceId, itemId) {
    const res = await fetch(
      `/api/v3/workspaces/${workspaceId}/items/${itemId}/scripts`,
      {
        credentials: "include",
        cache: "no-store",
      }
    );
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    scripts = data.scripts.filter((script) => script.scriptType === "ACTION");
  }

  function executeScript(script, label) {
    fetch(script.__self__, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (res.ok) {
          sendNotificationFromContentScript({
            status: "success",
            scriptName: script.uniqueName,
          });
        } else {
          let errorData;
          try {
            errorData = await res.json();
          } catch {
            errorData = null;
          }
          sendNotificationFromContentScript({
            status: "error",
            scriptName: script.uniqueName,
            errorStatus: res.status,
            errorData,
          });
        }
      })
      .catch((err) => {
        sendNotificationFromContentScript({
          status: "error",
          scriptName: script.uniqueName,
          errorStatus: 0,
          errorData: { message: err.message || "Unknown error" },
        });
      });
  }
  function extractToken(str, key) {
    // matches {color:#6ce663}, [color:#6ce663], {color:rgba(...)} etc.
    const re = new RegExp(`[\\[{]${key}:([^\\]}]+)[\\]}]`, "i");
    const m = str.match(re);
    return m ? m[1].trim() : null;
  }
  function createButton(script) {
    const iconMatch = script.displayName.match(/[\[{](fa-[\w- ]+)[\]}]/);
    const iconClass = iconMatch ? iconMatch[1].trim() : "fa-solid fa-cube";

    const colorToken = extractToken(script.displayName, "color");
    const displayNameClean = script.displayName
      .replace(/[\[{]fa-[\w- ]+[\]}]/, "")
      .trim();
    const tooltip = `${script.uniqueName}\n${displayNameClean}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = tooltip;
    btn.className = "square-icon md-button md-ink-ripple";
    Object.assign(btn.style, {
      lineHeight: "1",
      width: "34px",
      height: "34px",
      padding: "0",
      marginRight: "0px",
      marginLeft: "10px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "transparent",
      border: "1px solid #bec8d0",
      borderRadius: "2px",
      color: colorToken || "#63E6BE",
      fontSize: "14px",
      fontWeight: "500",
      fontFamily:
        'ArtifaktElement, "Helvetica Neue", Helvetica, Arial, sans-serif',
    });

    const icon = document.createElement("i");
    icon.className = iconClass;
    icon.style.pointerEvents = "none";
    btn.appendChild(icon);

    btn.onclick = () => executeScript(script, tooltip);
    return btn;
  }

  function createButtonContainer() {
    const outer = document.createElement("div");
    Object.assign(outer.style, {
      display: "flex",
      justifyContent: "flex-end",
      boxSizing: "border-box",
      width: "100vw",
      overflow: "hidden",
    });

    const inner = document.createElement("div");
    inner.id = "script-buttons-container";
    Object.assign(inner.style, {
      display: "flex",
      overflowX: "auto",
      whiteSpace: "nowrap",
      gap: "0px",
      maxWidth: "calc(100vw - 20px)",
      alignItems: "center",
      marginLeft: "0px",
      marginTop: "10px",
      flexShrink: "1",
    });

    outer.appendChild(inner);
    return { outer, inner };
  }

  function sendNotificationFromContentScript(payload) {
    window.postMessage({ type: "EXT_SEND_NOTIFICATION", ...payload }, "*");
  }

  function injectFontAwesome() {
    const existing = document.querySelector('link[href*="fontawesome"]');
    if (existing) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
    document.head.appendChild(link);
  }

  function getWorkspaceAndItemId() {
    return {
      workspaceId: getWorkspaceIdFromPath(),
      itemId: getItemIdFromQuery(),
    };
  }

  function getWorkspaceIdFromPath() {
    const match = window.location.pathname.match(/workspaces\/(\d+)/);
    return match ? match[1] : null;
  }

  function getItemIdFromQuery() {
    const urnParam = new URLSearchParams(window.location.search).get("itemId");
    return urnParam ? urnParam.split(",").pop() : null;
  }

  function getTenantIdFromUrl() {
    const match = location.hostname.match(/^([^.]+)\.autodeskplm360\.net$/);
    return match ? match[1] : null;
  }

  async function getUserId() {
    try {
      if (!isWorkspaceUrl(location.href)) {
        return;
      }

      const response = await fetch("/api/v3/users/@me", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const data = await response.json();
      return data.userId;
    } catch (error) {
      return null;
    }
  }

  function isWorkspaceUrl(url) {
    return /^https:\/\/.*\.autodeskplm360\.net\/plm\/workspaces\/\d+\/items\/itemDetails/.test(
      url
    );
  }

  function onUrlChange() {
    const newUrl = location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      if (isWorkspaceUrl(newUrl)) {
        lastWorkspaceId = null;
        lastItemId = null;
        initializeExtension();
      }
    }
  }

  function setupUrlWatcher() {
    const origPushState = history.pushState;
    history.pushState = function (...args) {
      origPushState.apply(this, args);
      setTimeout(onUrlChange, 0);
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      origReplaceState.apply(this, args);
      setTimeout(onUrlChange, 0);
    };

    window.addEventListener("popstate", onUrlChange);

    const observer = new MutationObserver(onUrlChange);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function initSocket(userId) {
    const tenantId = getTenantIdFromUrl();

    if (
      socket &&
      (socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    if (!isWorkspaceUrl(location.href)) {
      return;
    }

    if (!userId) {
      return;
    }

    try {
      socket = new WebSocket(
        "wss://app-001-a8c8bubhb4ere9hk.italynorth-01.azurewebsites.net/ws"
      );

      socket.onopen = () => {
        const initMessage = { tenantId, userId };
        socket.send(JSON.stringify(initMessage));
      };
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async function getFormularData() {
    try {
      if (!isWorkspaceUrl(location.href)) {
        return;
      }

      const response = await fetch(
        `/api/v3/workspaces/${getWorkspaceIdFromPath()}/items/${getItemIdFromQuery()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const data = await response.json();
      return getUrnsWithFormulaField(data);
    } catch (error) {
      return null;
    }
  }

  function getUrnsWithFormulaField(data) {
    const urns = [];

    function traverse(obj) {
      if (obj && typeof obj === "object") {
        const hasFormulaField = obj.formulaField === true && obj.urn;
        const hasType4or5 =
          obj.type &&
          obj.type.link &&
          /\/(30|3|10|15|27|23|16|13)$/.test(obj.type.link) &&
          obj.urn;

        if (hasFormulaField || hasType4or5) {
          urns.push(obj.urn.match(/([^.]+)$/)[1]);
        }

        for (const key in obj) {
          if (typeof obj[key] === "object") {
            traverse(obj[key]);
          }
        }
      }
    }

    traverse(data);
    return urns.join(",\n");
  }

  initSocket(await getUserId());
  const originalBackup = [];
  let translationEnabled = true;

  let formularData;

  formularData = await getFormularData();

  console.log(formularData);

  function initTranslation() {
    setTimeout(() => {
      init();
    }, 500);

    let retries = 0;

    function init() {
      const divs = document.querySelectorAll(".MuiPaper-root");

      if (divs.length <= 0 && retries !== 25) {
        setTimeout(() => {
          retries++;
          init();
        }, 200);
      } else if (retries == 3) {
        return;
      }

      if (translationEnabled) {
        const oldButton =
          document.getElementById("command-bar-react").firstChild.firstChild;
        if (oldButton !== null) {
          oldButton.addEventListener("click", revertTranslation, {
            capture: true,
          });
        } else {
          return;
        }
      }

      if (translationEnabled == false) {
        setTimeout(() => {
          const cancelButton = document
            .getElementById("command-bar-react")
            .children.item(1).firstChild;
          const saveButton =
            document.getElementById("command-bar-react").firstChild.firstChild;
          cancelButton.addEventListener("click", waitAndTranslate);
          saveButton.addEventListener("click", waitAndTranslate2);
        }, 500);
      }

      setTimeout(addTranslationIdsAndTranslate, 300);

      divs.forEach((div) => {
        div.addEventListener("click", addTranslationIdsAndTranslate);
      });
    }
  }

  function translateObject(id) {
    const el = document.querySelector(`[translation-id="${id}"]`);
    if (el && !el.hasAttribute("translated")) {
      const text = el.innerHTML;
      translateText(text, id);
    }
  }

  function generateRandomId() {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function addTranslationIdsAndTranslate() {
    if (!translationEnabled) return;

    setTimeout(async () => {
      const rows = document.querySelectorAll(
        ".plm-panel-row.plm-item-detail-field"
      );

      // Build exclusions array (wait for storage)
      const exclusions = await getExclusions();

      rows.forEach((row) => {
        const rowkey = row.getAttribute("row-key").match(/([^.]+)$/)[1];
        const keyEl = row.querySelector(".field-label-value");
        const valueEl = row.querySelector(".plm-item-detail-field-value");

        if (!valueEl) return;

        if (
          exclusions.includes(keyEl.textContent.toLowerCase()) ||
          formularData.includes(rowkey)
        )
          return;
        if (valueEl.textContent === "") return;

        if (!valueEl.hasAttribute("translation-id")) {
          const randomId = generateRandomId();
          const originalElement = {
            id: randomId,
            value: valueEl.parentElement.innerHTML,
          };
          originalBackup.push(originalElement);
          valueEl.setAttribute("translation-id", randomId);
        }

        if (!valueEl.hasAttribute("translated")) {
          translateObject(valueEl.getAttribute("translation-id"));
        } else if (valueEl.children.length >= 2) {
          valueEl.firstChild.setAttribute("style", "display: none");
          valueEl.lastChild.removeAttribute("style");
        }
      });
    }, 100);
  }

  function getExclusions() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["excludeList"], (data) => {
        const excludedFields = (data.excludeList || "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length > 0);

        resolve(["id", ...excludedFields]);
      });
    });
  }

  function revertTranslation() {
    translationEnabled = false;
    originalBackup.forEach((el) => {
      const el1 = document.querySelector(`[translation-id="${el.id}"]`);
      el1.firstChild.removeAttribute("style");
      el1.lastChild.setAttribute("style", "display: none");
    });
  }

  function waitAndTranslate2() {
    translationEnabled = true;
    originalBackup.forEach((el) => {
      const el1 = document.querySelector(`[translation-id="${el.id}"]`);
      el1.removeAttribute("translated");
      el1.firstChild.removeAttribute("style");
      el1.removeChild(el1.lastChild);
      originalBackup.splice(0, originalBackup.length);
    });
  }

  function waitAndTranslate() {
    setTimeout(() => {
      const exitButton = document.querySelector(
        `[ng-click="navGuardCtrl.confirmExit('YES')"]`
      );
      const stayButton = document.querySelector(
        `[ng-click="navGuardCtrl.confirmExit('NO')"]`
      );
      if (exitButton !== null) {
        exitButton.addEventListener("click", setTranslationTrue);
        stayButton.addEventListener("click", setTranslationFalse);
      }
    }, 200);

    translationEnabled = true;
  }

  function setTranslationTrue() {
    translationEnabled = true;
  }

  function setTranslationFalse() {
    translationEnabled = false;
  }

  function translateText(text, id) {
    const translatePayload = {
      type: "translate",
      id,
      text,
      targetLanguage: language,
    };

    socket.send(JSON.stringify(translatePayload));
  }

  if (socket) {
    socket.onmessage = (event) => {
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        if (data.type == "translation") {
          injectTranslation(data.message, data.id, data.originalmessage);
        } else {
          if (data.status === "debug") {
            console.log("Proxy DEBUG:", data.message);
          } else if (data.status !== "ignore") {
            window.postMessage(
              {
                type: "showToast",
                payload: {
                  message: data.message,
                  status: data.status || "info",
                },
              },
              "*"
            );
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
  }

  function injectTranslation(message, id, originalmessage) {
    const el1 = document.querySelector(`[translation-id="${id}"]`);

    if (el1) {
      el1.firstElementChild.setAttribute("style", "display: none");
      const parser = new DOMParser();
      const doc = parser.parseFromString(message, "text/html");
      const newNode = doc.body.firstElementChild;

      el1.appendChild(newNode);
      el1.setAttribute("translated", true);
    }
  }

  if (isWorkspaceUrl(location.href)) {
    initializeExtension();
  }

  setupUrlWatcher();
})();
