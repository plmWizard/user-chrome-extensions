document.addEventListener('DOMContentLoaded', () => {
  const checkboxes = {
    enableRemoveActions: document.getElementById('enableRemoveActions'),
    enableScriptButtons: document.getElementById('enableScriptButtons'),
    enableStandartActionButtons: document.getElementById('enableStandartActionButtons'),
    enableTextLinks: document.getElementById('enableTextLinks'),
    enableWebLinks: document.getElementById('enableWebLinks'),
    enableLocalLinks: document.getElementById('enableLocalLinks'),
    enableNetworkLinks: document.getElementById('enableNetworkLinks'),
    enableVaultLinks: document.getElementById('enableVaultLinks'),
    enableResendEmailButton: document.getElementById('enableResendEmailButton'),
    enableProxyServerButton: document.getElementById('enableProxyServerButton'),
    enableTranslation: document.getElementById('enableTranslation')
  };

  const excludeList = document.getElementById('excludeList');

  // Setup sub-option container for text links
  const subOptionContainer = document.createElement('div');
  subOptionContainer.id = 'textLinkSubOptions';
  subOptionContainer.style.transition = 'max-height 0.4s ease, opacity 0.4s ease';
  subOptionContainer.style.overflow = 'hidden';
  subOptionContainer.style.maxHeight = '0';
  subOptionContainer.style.opacity = '0';

  const subCheckboxes = ['enableWebLinks', 'enableLocalLinks', 'enableNetworkLinks', 'enableVaultLinks'];

  const container = checkboxes.enableTextLinks.closest('.form-check');
  container.after(subOptionContainer);

  subCheckboxes.forEach((key) => {
    const cb = checkboxes[key].closest('.form-check');
    subOptionContainer.appendChild(cb);
  });

  function updateSubOptionsDisplay() {
    const parentChecked = checkboxes.enableTextLinks.checked;
    subOptionContainer.style.maxHeight = parentChecked ? subOptionContainer.scrollHeight + 'px' : '0';
    subOptionContainer.style.opacity = parentChecked ? '1' : '0';
  }

  // Load saved settings
  chrome.storage.sync.get([...Object.keys(checkboxes), 'excludeList'], (data) => {
    const defaultsToSet = {};

    for (const key in checkboxes) {
      const isSet = typeof data[key] === 'boolean';
      if (!isSet) defaultsToSet[key] = true;
      checkboxes[key].checked = isSet ? data[key] : true;
    }

    // Load excludeList value
    excludeList.value = data.excludeList || '';

    if (Object.keys(defaultsToSet).length > 0) {
      chrome.storage.sync.set(defaultsToSet);
    }

    updateDependencies();
    updateSubOptionsDisplay();
  });

  // Checkbox listeners
  for (const key in checkboxes) {
    checkboxes[key].addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: checkboxes[key].checked });
      if (key === 'enableTextLinks') updateSubOptionsDisplay();
      if (subCheckboxes.includes(key)) syncParentCheckbox();
      updateDependencies();
    });
  }

  // Input field listener
  excludeList.addEventListener('input', () => {
    chrome.storage.sync.set({ excludeList: excludeList.value });
  });

  function updateDependencies() {
    const scriptEnabled = checkboxes.enableScriptButtons.checked;
    if (!scriptEnabled) {
      checkboxes.enableRemoveActions.checked = false;
      checkboxes.enableRemoveActions.disabled = true;
      chrome.storage.sync.set({ enableRemoveActions: false });
    } else {
      checkboxes.enableRemoveActions.disabled = false;
    }
  }

  function syncParentCheckbox() {
    const allOff = subCheckboxes.every((key) => !checkboxes[key].checked);
    const anyOn = subCheckboxes.some((key) => checkboxes[key].checked);
    if (allOff) {
      checkboxes.enableTextLinks.checked = false;
      chrome.storage.sync.set({ enableTextLinks: false });
    } else if (anyOn && !checkboxes.enableTextLinks.checked) {
      checkboxes.enableTextLinks.checked = true;
      chrome.storage.sync.set({ enableTextLinks: true });
    }
    updateSubOptionsDisplay();
  }
});
