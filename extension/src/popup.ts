// popup.ts — UI controller for Source Hunter popup
import type { TraceResult, TraceError, CitationStep, ClaimVerdict } from './types.js';
import { BACKEND_URL, isTraceError } from './types.js';

// ── DOM helpers ───────────────────────────────────────────────────────────

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

function show(id: string) { $(id).classList.remove('hidden'); }
function hide(id: string) { $(id).classList.add('hidden'); }
function setText(id: string, text: string) { $(id).textContent = text; }

// ── State management ──────────────────────────────────────────────────────

type State = 'idle' | 'loading' | 'result' | 'error';

function showState(state: State) {
  const states: State[] = ['idle', 'loading', 'result', 'error'];
  for (const s of states) {
    const el = document.getElementById(`state-${s}`);
    if (el) el.classList.toggle('hidden', s !== state);
  }
}

// ── Verdict display ───────────────────────────────────────────────────────

const VERDICT_META: Record<ClaimVerdict, { icon: string; label: string; cssClass: string }> = {
  'partial-support': { icon: 'i', label: 'Partial Evidence - Review Needed', cssClass: 'verdict-unknown' },
  matches:     { icon: '✅', label: 'Matches Primary Source', cssClass: 'verdict-matches' },
  rounded:     { icon: '🔢', label: 'Number Rounded in Claim', cssClass: 'verdict-rounded' },
  altered:     { icon: '✏️', label: 'Claim Wording Altered', cssClass: 'verdict-altered' },
  misquoted:   { icon: '❌', label: 'Claim Misquotes Source', cssClass: 'verdict-misquoted' },
  unsupported: { icon: '⚠️', label: 'Claim Unsupported by Source', cssClass: 'verdict-unsupported' },
  'no-source': { icon: '🔍', label: 'No Original Source Found', cssClass: 'verdict-no-source' },
  unknown:     { icon: '❓', label: 'Insufficient Evidence', cssClass: 'verdict-unknown' },
};

function renderVerdict(verdict: ClaimVerdict, explanation: string) {
  const banner = $('verdict-banner');
  const meta = VERDICT_META[verdict] ?? VERDICT_META.unknown;
  banner.className = `verdict-banner ${meta.cssClass}`;
  banner.innerHTML = `<span>${meta.icon}</span> <span>${meta.label}</span>`;
}

// ── Citation step renderer ────────────────────────────────────────────────

function renderStep(step: CitationStep, index: number, total: number, refutationUrl?: string): string {
  const dateDisplay = step.date
    ? `<span>${step.date}</span>`
    : `<span class="unknown">Date unknown</span>`;

  const excerpt = step.excerpt
    ? `<div class="step-excerpt">"${escapeHtml(step.excerpt)}"</div>`
    : '';

  return `
    <div class="chain-step${step.isPrimary ? ' is-primary' : ''}">
      <div class="step-title">
        <span class="step-number">${index + 1}</span>
        <span>${escapeHtml(step.title || 'Unknown source')}</span>
        ${step.url === refutationUrl ? '<span>Refuting evidence</span>' : ''}
      </div>
      <a href="${escapeHtml(step.url)}" target="_blank" rel="noopener noreferrer" class="step-url"
         title="${escapeHtml(step.url)}">${escapeHtml(truncate(step.url, 60))}</a>
      <div class="step-date">📅 ${dateDisplay}</div>
      <div>${step.isPrimary ? 'Primary-source evidence' : step.relationship === 'cites' ? 'Verified link to next source' : 'Related evidence: connection unverified'}</div>
      ${excerpt}
    </div>
    ${index < total - 1 && step.relationship === 'cites' ? `
    <div class="step-connector">
      <div class="connector-line"></div>
      <span>↓ links to</span>
      <div class="connector-line"></div>
    </div>` : ''}
  `;
}

// ── Render result ─────────────────────────────────────────────────────────

function renderResult(result: TraceResult) {
  renderVerdict(result.verdict, result.verdictExplanation);

  $('claim-box').textContent = `"${result.claim}"`;

  // Verdict explanation
  const existingExpl = document.getElementById('verdict-explanation');
  if (existingExpl) existingExpl.remove();
  const expl = document.createElement('div');
  expl.id = 'verdict-explanation';
  expl.className = 'verdict-explanation';
  expl.textContent = result.verdictExplanation;
  $('claim-box').insertAdjacentElement('afterend', expl);

  // Citation chain (reverse order: most recent → primary)
  const container = $('chain-container');
  if (result.chain.length === 0) {
    container.innerHTML = `
      <div class="chain-step">
        <div style="color: var(--muted); font-size: 12px;">
          ${escapeHtml(result.noSourceReason ?? 'No traceable citation chain found.')}
        </div>
      </div>
    `;
  } else {
    container.innerHTML = result.chain
      .map((step, i) => renderStep(step, i, result.chain.length, result.refutingSource?.url))
      .join('');

    // Open links in new tab via click delegation
    container.querySelectorAll('a.step-url').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const href = (a as HTMLAnchorElement).href;
        chrome.tabs.create({ url: href });
      });
    });
  }

  // Partial warning
  if (result.isPartial) {
    show('partial-warning');
  } else {
    hide('partial-warning');
  }

  showState('result');
}

// ── Error renderer ────────────────────────────────────────────────────────

function renderError(err: TraceError | string) {
  const msg = typeof err === 'string' ? err : err.error;
  $('error-message').textContent = msg;
  showState('error');
}

// ── Utilities ─────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '…' : s;
}

// ── Copy report to clipboard ──────────────────────────────────────────────

function buildReport(result: TraceResult): string {
  const lines: string[] = [
    `# Source Hunter Report`,
    `Traced: ${result.tracedAt}`,
    ``,
    `## Claim`,
    `"${result.claim}"`,
    ``,
    `## Verdict: ${result.verdict.toUpperCase()}`,
    result.verdictExplanation,
    ``,
    `## Sources and Verified Connections`,
    `Order is not a proven citation trail. Only explicit links are marked verified.`,
  ];
  for (const [i, step] of result.chain.entries()) {
    lines.push(`\n### Step ${i + 1}${step.isPrimary ? ' (Primary Source)' : ''}`);
    lines.push(`Title: ${step.title}`);
    lines.push(`URL: ${step.url}`);
    lines.push(`Connection: ${step.relationship === 'cites' ? 'Verified link to next source' : step.isPrimary ? 'Primary-source evidence' : 'Unverified / related evidence'}`);
    lines.push(`Date: ${step.date ?? 'Unknown'}`);
    lines.push(`Excerpt: "${step.excerpt}"`);
  }
  if (result.isPartial) lines.push(`\n⚠️ Partial result — trace timed out.`);
  return lines.join('\n');
}

// ── Main initialization ───────────────────────────────────────────────────

let currentTrace: { claim: string; pageUrl: string; pageTitle: string } | null = null;

async function init() {
  showState('idle');

  // Check if there's an ongoing or completed trace
  const data = await chrome.storage.local.get(['pendingTrace', 'traceState', 'traceResult', 'currentSelection', 'traceJobId']);

  const sel = typeof data.currentSelection === 'string' ? data.currentSelection.trim() : '';
  if (sel && sel.length >= 5) {
    const preview = $('selection-preview');
    preview.textContent = `"${truncate(sel, 180)}"`;
    preview.classList.remove('hidden');
    $('btn-trace-selection').classList.remove('hidden');
  }

  if (data.traceState === 'loading') {
    if (data.pendingTrace) {
      currentTrace = data.pendingTrace;
      const ct = currentTrace;
      if (ct) $('claim-preview').textContent = `"${truncate(ct.claim, 120)}"`;
    }
    showState('loading');
    if (typeof data.traceJobId === 'string') void pollForResult(data.traceJobId);
    else renderError('This older trace has no saved job. Start a new trace.');
    return;
  }

  if (data.traceState === 'done' && data.traceResult) {
    const result = data.traceResult;
    if (isTraceError(result)) {
      renderError(result);
    } else {
      renderResult(result as TraceResult);
    }
    return;
  }

  if (data.traceState === 'error' && data.traceResult) {
    renderError(data.traceResult as TraceError);
    return;
  }

  if (data.traceState === 'pending' && data.pendingTrace) {
    const pt = data.pendingTrace as { claim: string; pageUrl: string; pageTitle: string };
    currentTrace = pt;
    startTrace(pt.claim, pt.pageUrl, pt.pageTitle);
    return;
  }
}

function startTrace(claim: string, pageUrl: string, pageTitle: string) {
  currentTrace = { claim, pageUrl, pageTitle };
  $('claim-preview').textContent = `"${truncate(claim, 120)}"`;
  showState('loading');
  chrome.runtime.sendMessage({type: 'START_TRACE', claim, pageUrl, pageTitle}, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      renderError(response?.error ?? 'Could not reach extension background.');
      return;
    }
    void init();
  });
}

async function pollForResult(id: string) {
  const state = await chrome.storage.local.get(['traceJobId', 'traceState']);
  if (state.traceJobId !== id || state.traceState !== 'loading') return;
  try {
    const response = await fetch(`${BACKEND_URL}/trace-jobs/${encodeURIComponent(id)}`, {
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    const result = response.ok ? data.result : data;
    const current = await chrome.storage.local.get(['traceJobId', 'traceState']);
    if (current.traceJobId !== id || current.traceState !== 'loading') return;
    if (result) {
      await chrome.storage.local.set({traceState: 'done', traceResult: result});
      if (isTraceError(result)) renderError(result);
      else renderResult(result as TraceResult);
      return;
    }
  } catch {
    // Keep the job ID so the popup can reconnect when the backend is reachable.
  }
  setTimeout(() => void pollForResult(id), 3000);
}

// ── Event listeners ───────────────────────────────────────────────────────

$('btn-clear').addEventListener('click', async () => {
  await chrome.storage.local.set({ pendingTrace: null, traceState: 'idle', traceResult: null, currentSelection: '' });
  currentTrace = null;
  showState('idle');
  $('selection-preview').classList.add('hidden');
  $('btn-trace-selection').classList.add('hidden');
});

$('btn-cancel').addEventListener('click', () => window.close());

$('btn-trace-selection').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['currentSelection']);
  const sel = typeof data.currentSelection === 'string' ? data.currentSelection.trim() : '';
  if (!sel || sel.length < 5) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  startTrace(sel, tab?.url ?? '', tab?.title ?? '');
});

$('btn-new-trace').addEventListener('click', async () => {
  await chrome.storage.local.set({ pendingTrace: null, traceState: 'idle', traceResult: null });
  currentTrace = null;
  showState('idle');
});

$('btn-new').addEventListener('click', async () => {
  await chrome.storage.local.set({ pendingTrace: null, traceState: 'idle', traceResult: null });
  currentTrace = null;
  showState('idle');
});

$('btn-retry').addEventListener('click', () => {
  const ct = currentTrace;
  if (ct) {
    startTrace(ct.claim, ct.pageUrl, ct.pageTitle);
  } else {
    showState('idle');
  }
});

$('btn-copy').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['traceResult']);
  if (data.traceResult && !isTraceError(data.traceResult)) {
    const report = buildReport(data.traceResult as TraceResult);
    await navigator.clipboard.writeText(report);
    const btn = $('btn-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy Report'; }, 2000);
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────

init().catch(e => {
  console.error('[popup] init error:', e);
  renderError('Extension initialization failed. Try reloading.');
});
