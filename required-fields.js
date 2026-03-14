(() => {
  const EMPTY_REQUIRED_ROW_CLASS = "fm-required-row-empty";
  const EMPHASIZED_LABEL_CLASS = "fm-required-label-empty";
  const VALUE_HINT_CLASS = "fm-required-value-empty";
  const STYLE_ID = "fm-required-field-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${EMPTY_REQUIRED_ROW_CLASS} {
        background: linear-gradient(
          to right,
          rgba(255, 196, 196, 0.14) 0,
          rgba(255, 196, 196, 0.14) 220px,
          transparent 220px,
          transparent 100%
        ) !important;
        transition: background 0.2s ease;
      }

      .${EMPHASIZED_LABEL_CLASS} .field-label-value {
        font-weight: 700 !important;
        color: #9f2f2f !important;
      }

      .${EMPHASIZED_LABEL_CLASS} .field-label-required {
        color: #d64545 !important;
        font-size: 1.05em !important;
      }

      .${VALUE_HINT_CLASS} {
        position: relative;
        transition: background 0.2s ease, box-shadow 0.2s ease;
        background: rgba(255, 245, 245, 0.55) !important;
        border-radius: 6px !important;
      }

      .${VALUE_HINT_CLASS}::before {
        content: "";
        position: absolute;
        left: 0;
        top: 6px;
        bottom: 6px;
        width: 4px;
        border-radius: 999px;
        background: #f0a3a3;
        pointer-events: none;
      }

      .${VALUE_HINT_CLASS}:focus-within {
        background: rgba(255, 240, 240, 0.8) !important;
        box-shadow: inset 0 0 0 1px rgba(240, 163, 163, 0.45) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isRequiredRow(row) {
    return !!row.querySelector(".field-label-required");
  }

  function getTitleCell(row) {
    return row.querySelector(".plm-item-detail-field-title");
  }

  function getValueCell(row) {
    return row.querySelector(".plm-item-detail-field-value");
  }

  function getEditableElement(container) {
    if (!container) return null;

    return (
      container.querySelector("input, textarea, select, [contenteditable='true']") ||
      container
    );
  }

  function getElementValue(el) {
    if (!el) return "";

    if (el.matches("input, textarea, select")) {
      return (el.value || "").trim();
    }

    if (el.getAttribute("contenteditable") === "true") {
      return (el.textContent || "").trim();
    }

    return (el.textContent || "").trim();
  }

  function setEmptyState(row, isEmpty) {
    const titleCell = getTitleCell(row);
    const valueCell = getValueCell(row);

    row.classList.toggle(EMPTY_REQUIRED_ROW_CLASS, isEmpty);
    if (titleCell) titleCell.classList.toggle(EMPHASIZED_LABEL_CLASS, isEmpty);
    if (valueCell) valueCell.classList.toggle(VALUE_HINT_CLASS, isEmpty);
  }

  function updateRequiredState(row) {
    if (!isRequiredRow(row)) return;

    const valueCell = getValueCell(row);
    if (!valueCell) return;

    const editable = getEditableElement(valueCell);
    const value = getElementValue(editable);
    setEmptyState(row, !value);
  }

  function bindRow(row) {
    if (!row || row.dataset.fmRequiredBound === "true") return;
    if (!isRequiredRow(row)) return;

    row.dataset.fmRequiredBound = "true";

    const valueCell = getValueCell(row);
    if (!valueCell) return;

    const editable = getEditableElement(valueCell);
    const handler = () => updateRequiredState(row);

    if (editable) {
      editable.addEventListener("input", handler, true);
      editable.addEventListener("change", handler, true);
      editable.addEventListener("keyup", handler, true);
      editable.addEventListener("blur", handler, true);
    }

    valueCell.addEventListener("input", handler, true);
    valueCell.addEventListener("change", handler, true);
    valueCell.addEventListener("keyup", handler, true);

    updateRequiredState(row);
  }

  function scanRequiredRows(root = document) {
    const rows = root.querySelectorAll(".plm-item-detail-field");
    rows.forEach(bindRow);
    rows.forEach(updateRequiredState);
  }

  function initObserver() {
    const observer = new MutationObserver(() => {
      scanRequiredRows();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function init() {
    injectStyles();
    scanRequiredRows();
    initObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();