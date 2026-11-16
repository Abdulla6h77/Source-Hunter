// background.ts — Chrome MV3 service worker
// Registers context menu, routes messages to backend, manages storage.

import type { TraceError } from './types.js';
import { BACKEND_URL } from './types.js';

const MENU_ID = 'source-hunter-trace';

// ── Context menu ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Trace source with Source Hunter',
    contexts: ['selection'],
  });
});

// ── Context menu click ────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (!info.selectionText || !tab?.id) return;

  const claim = info.selectionText.trim();
  const pageUrl = tab.url ?? '';
  const pageTitle = tab.title ?? '';

  if (!claim || claim.length < 5) return;

  await enqueueTrace(claim, pageUrl, pageTitle);

  // Open popup
  await chrome.action.openPopup().catch(() => {
    // openPopup() can fail if the popup is already open — ignore
  });
});

// ── Message router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_TRACE') {
    enqueueTrace(message.claim, message.pageUrl, message.pageTitle)
      .then(() => sendResponse({ok: true}))
      .catch(() => sendResponse({ok: false, error: 'Could not queue the claim.'}));
    return true; // keep channel open for async response
  }

  if (message.type === 'GET_STATE') {
    chrome.storage.local.get(['pendingTrace', 'traceState', 'traceResult'])
      .then(data => sendResponse({ ok: true, ...data }));
    return true;
  }

  if (message.type === 'CLEAR_STATE') {
    chrome.storage.local.set({ pendingTrace: null, traceState: 'idle', traceResult: null })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ── Backend call ───────────────────────────────────────────────────────────

async function enqueueTrace(claim: string, pageUrl: string, pageTitle: string): Promise<void> {
  const id = crypto.randomUUID();
  await chrome.storage.local.set({
    traceJobId: id, pendingTrace: {claim, pageUrl, pageTitle}, traceState: 'loading', traceResult: null,
  });
  try {
    const response = await fetch(`${BACKEND_URL}/trace-jobs`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({claim, pageUrl, pageTitle, jobId: id}),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const result = await response.json() as TraceError;
      const state = await chrome.storage.local.get('traceJobId');
      if (state.traceJobId === id) {
        await chrome.storage.local.set({traceState: 'error', traceResult: result});
      }
    }
  } catch {
    // The backend may have accepted the job before the connection dropped.
    // The popup can check the saved ID without starting another job.
  }
}
