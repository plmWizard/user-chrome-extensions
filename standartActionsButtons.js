chrome.storage.sync.get(['enableStandartActionButtons'], (data) => {
  if (!data.enableStandartActionButtons) return;

  (function () {
    const MORE_ACTIONS_BUTTON_SELECTOR = '#item-viewer-more-actions-button';
    const CLICK_DELAY_MS = 0;

    function findMenuItem(actions) {
      const menuItems = document.querySelectorAll(
        'div.MuiPaper-root.MuiMenu-paper.MuiPopover-paper.MuiPaper-elevation8.MuiPaper-rounded ul li'
      );
      return Array.from(menuItems).find(li => {
        const label = li.querySelector('span')?.textContent.trim();
        return actions.includes(label);
      });
    }

    function clickActionFromDropdown(actionOrActions) {
      const actionsArray = Array.isArray(actionOrActions) ? actionOrActions : [actionOrActions];
      window.__ignoreDropdownObserver = true;

      let actionLi = findMenuItem(actionsArray);
      if (actionLi) {
        actionLi.click();
        window.__ignoreDropdownObserver = false;
        return;
      }

      const moreBtn = document.querySelector(MORE_ACTIONS_BUTTON_SELECTOR);
      if (!moreBtn) {
        console.warn(`[ActionHelper] Cannot find More Actions button: ${MORE_ACTIONS_BUTTON_SELECTOR}`);
        window.__ignoreDropdownObserver = false;
        return;
      }

      moreBtn.click();

      setTimeout(() => {
        actionLi = findMenuItem(actionsArray);
        if (!actionLi) {
          console.warn(`[ActionHelper] "${actionsArray.join('" or "')}" item still not found after opening dropdown.`);
          window.__ignoreDropdownObserver = false;
          return;
        }

        const dropdownRoot = actionLi.closest(
          'div.MuiPopover-root.plm-dropdown-widget-wrapper.item-viewer-more-actions-menu'
        );
        if (dropdownRoot) {
          dropdownRoot.style.visibility = 'hidden';
        }

        actionLi.click();
        window.__ignoreDropdownObserver = false;
      }, CLICK_DELAY_MS);
    }

    const DEFAULT_ACTIONS = ['Clone', 'Archive/Unarchive', 'Create New Item'];
    const BUTTON_CONTAINER_ID = 'standard-action-buttons';

    const ACTION_METHODS = {
      'Clone': () => clickActionFromDropdown(cloneName),
      'Archive/Unarchive': () => clickActionFromDropdown([archiveName, unarchiveName]),
      'Create New Item': () => clickActionFromDropdown(createname)
    };

    const ICONS = {
      'Clone': 'fa-solid fa-clone',
      'Archive/Unarchive': 'fa-solid fa-box-archive',
      'Create New Item': 'fa-solid fa-plus'
    };

    function createStandardButton(action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = action;
      button.className = 'square-icon md-button md-ink-ripple';
      button.style.cssText = `
        line-height: 1;
        width: 34px;
        height: 34px;
        padding: 0;
        margin-right: 10px;
        margin-left: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: transparent;
        border: 1px solid #bec8d0;
        border-radius: 2px;
        color: #0a131c;
        font-size: 14px;
        font-weight: 500;
        font-family: ArtifaktElement, "Helvetica Neue", Helvetica, Arial, sans-serif;
        cursor: pointer;
      `;

      const icon = document.createElement('i');
      icon.className = ICONS[action] || 'fa-solid fa-circle-question';
      icon.style.pointerEvents = 'none';
      button.appendChild(icon);

      button.onclick = () => {
        const handler = ACTION_METHODS[action];
        if (handler) handler();
      };

      return button;
    }

    function injectButtons() {
      if (document.getElementById(BUTTON_CONTAINER_ID)) return;

      const wrapper = document.getElementById('itemviewer-wrapper-buttons');
      if (!wrapper) return;

      const container = document.createElement('div');
      container.id = BUTTON_CONTAINER_ID;
      container.style.display = 'flex';

      DEFAULT_ACTIONS.forEach(action => {
        container.appendChild(createStandardButton(action));
      });

      wrapper.insertBefore(container, wrapper.firstChild);
    }

    var cloneName = "";
    var archiveName = "";
    var unarchiveName = "";
    var createName = "";

    switch(navigator.language.slice(0, 2)){
      case "en": cloneName="Clone"; archiveName="Archive"; unarchiveName="Unarchive"; createName="Create New Item"; break;
      case "de": cloneName="Klonen"; archiveName="Archivieren"; unarchiveName="Archivierung aufheben"; createName="Neuen Artikel erstellen"; break;
      case "it": cloneName="Clona"; archiveName="Archivia"; unarchiveName="Estrai da archivio"; createName="Crea nuovo articolo"; break;
    }

    const observer = new MutationObserver(mutations => {
      if (window.__ignoreDropdownObserver) return;

      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          if (
            addedNode.nodeType === 1 &&
            addedNode.classList.contains('MuiPopover-root') &&
            addedNode.classList.contains('item-viewer-more-actions-menu')
          ) {
            const ul = addedNode.querySelector('ul.MuiMenu-list');
            if (!ul) return;

            const items = Array.from(ul.querySelectorAll('li'));
            let removedAny = false;

            items.forEach(li => {
              const label = li.querySelector('span')?.textContent.trim();
              if ([cloneName, archiveName, unarchiveName, createName].includes(label)) {
                li.remove();
                removedAny = true;
              }
            });

            if (ul.children.length === 0) {
              const noOptionsLi = document.createElement('li');
              noOptionsLi.textContent = 'No options available';
              noOptionsLi.style.cssText = `
                padding: 10px 20px;
                color: #888;
                cursor: default;
                user-select: none;
              `;
              ul.appendChild(noOptionsLi);
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    function initialize() {
      const wrapper = document.getElementById('itemviewer-wrapper-buttons');
      if (!wrapper) return;

      injectButtons();
    }

    const initObserver = new MutationObserver(() => initialize());
    initObserver.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => initialize(), 3000);
  })();
});