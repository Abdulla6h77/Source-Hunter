// content.ts — injected into every http/https page
// Listens for text selections and provides selection info to the popup.

// When the user selects text and presses the Source Hunter keyboard shortcut
// (or uses the context menu), content.js sends the selection to the background.

document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  const text = selection.toString().trim();
  if (text.length >= 5 && text.length <= 2000) {
    // Store selection in the extension for quick access from popup
    chrome.storage.local.set({ currentSelection: text }).catch(() => {});
  }
});
