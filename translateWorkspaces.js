let domObserver = null;
const language = navigator.language.slice(0, 2);

translateTextNodesOnce();

domObserver = new MutationObserver(() => {
  translateTextNodesOnce();
});

domObserver.observe(document.body, {
  childList: true,
  subtree: true
});

function translateTextNodesOnce() {

  const elements = document.querySelectorAll(
    '.field-label-value, .plm-panel-cell.plm-item-detail-matrix-field-row-name, span'
  );

  let isPlmRow = false;
  let isSpanWithMatchingTitle = false;
  let isSpanInJssWithMatchingParentTitle = false;

  if (el.tagName === "SPAN") {
    const parent = el.parentElement;

    isPlmRow =
      el.classList.contains("plm-panel-cell") &&
      el.classList.contains("plm-item-detail-matrix-field-row-name");

    isSpanWithMatchingTitle =
      el.hasAttribute("title") &&
      el.title.trim() === el.textContent.trim();

    isSpanInJssWithMatchingParentTitle =
      parent?.className.startsWith("jss") &&
      parent.title?.trim() === el.textContent.trim() &&
      el.attributes.length === 0;

    if (
      !isPlmRow &&
      !isSpanWithMatchingTitle &&
      !isSpanInJssWithMatchingParentTitle
    ) {
      return;
    }
  }

  if (el.tagName === "DIV" && !el.classList.contains("field-label-value")) {
    return;
  }

  const originalText = el.textContent.trim();

  let lookupText = originalText;
  let suffix = '';

  if (isSpanInJssWithMatchingParentTitle) {
    lookupText = originalText.replace(/\s*\(.*?\)\s*/g, '').trim();
    const match = originalText.match(/\(.*?\)/);
    suffix = match ? ' ' + match[0] : '';
  }
}