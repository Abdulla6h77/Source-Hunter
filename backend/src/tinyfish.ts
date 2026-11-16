// TinyFish API client — Source Hunter backend
// Wraps Search, Fetch, Agent, and TinyResearch endpoints.
// API key is read server-side only; never sent to the extension.

export const ENDPOINTS = {
  search: 'https://api.search.tinyfish.ai',
  fetch: 'https://api.fetch.tinyfish.ai',
  agent: 'https://agent.tinyfish.ai/v1/automation/run',
  research: 'https://agent.tinyfish.ai/v1/automation/run-research',
} as const;

export class TinyFishError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'TinyFishError';
  }
}

function getKey(): string {
  const key = process.env.TINYFISH_API_KEY;
  if (!key || key.trim() === '') {
    throw new TinyFishError(503, 'TINYFISH_API_KEY is not configured. Add it to backend/.env and restart.');
  }
  return key.trim();
}

/** Generic JSON request helper (non-streaming). */
export async function tfRequest(
  url: string,
  body?: unknown,
  timeoutMs = 45_000,
): Promise<unknown> {
  const key = getKey();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        'X-API-Key': key,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) {
      const msg =
        res.status === 401 ? 'TinyFish API key rejected.' :
        res.status === 402 ? 'TinyFish quota exhausted.' :
        res.status === 429 ? 'TinyFish rate limit reached.' :
        `TinyFish HTTP ${res.status}`;
      throw new TinyFishError(res.status, msg);
    }
    const text = await res.text();
    return JSON.parse(text);
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof TinyFishError) throw e;
    if (e instanceof Error && /abort/i.test(e.name)) {
      throw new TinyFishError(504, `TinyFish request timed out after ${timeoutMs / 1000}s`);
    }
    throw new TinyFishError(502, `TinyFish request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export interface ResearchEvent {
  event: string;
  delta?: string;
  result?: unknown;
  run_id?: string;
  research_run_id?: string;
  status?: string;
  error?: string;
  url?: string;
  title?: string;
  citations?: unknown[];
}

/** Streaming TinyResearch call. Calls onEvent for each SSE line. */
export async function tfResearch(
  query: string,
  onEvent: (evt: ResearchEvent) => void,
  timeoutMs = 46 * 60_000,
): Promise<{ run_id: string | null; report: string; citations: unknown[]; finalCitations: unknown[] }> {
  const key = getKey();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let report = '';
  let run_id: string | null = null;
  const citations: unknown[] = [];
  let finalCitations: unknown[] = [];

  try {
    const res = await fetch(ENDPOINTS.research, {
      method: 'POST',
      headers: {
        'X-API-Key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, mode: 'deep', stream: true }),
      signal: ctrl.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      clearTimeout(timer);
      const msg =
        res.status === 401 ? 'TinyFish API key rejected.' :
        res.status === 402 ? 'TinyFish quota exhausted.' :
        res.status === 429 ? 'TinyFish rate limit reached.' :
        `TinyFish HTTP ${res.status}`;
      throw new TinyFishError(res.status, msg);
    }

    if (!res.body) throw new TinyFishError(502, 'TinyResearch returned no body');
    run_id = res.headers.get('x-research-run-id');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') break;
        try {
          const evt: ResearchEvent = JSON.parse(payload);
          onEvent(evt);
          if (evt.research_run_id) run_id = evt.research_run_id;
          else if (evt.run_id) run_id = evt.run_id;

          if (evt.event === 'synthesis_delta' && typeof evt.delta === 'string') {
            report += evt.delta;
          }
          if (evt.event === 'source_fetched' && evt.url) {
            citations.push({
              url: evt.url,
              title: evt.title || '',
              status: evt.status,
            });
          }
          if (evt.event === 'final_result') {
            completed = true;
            if (typeof evt.result === 'string') report = evt.result;
          }
          if (evt.event === 'final_result' && Array.isArray(evt.citations)) {
            finalCitations = evt.citations;
          } else if (evt.event === 'citations' && Array.isArray(evt.result)) {
            citations.push(...evt.result);
          }
        } catch {
          // malformed SSE line — skip
        }
      }
    }
    if (!completed || !report.trim()) {
      throw new TinyFishError(502, 'TinyResearch did not deliver a final report. Check the existing run before retrying.');
    }
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof TinyFishError) throw e;
    if (e instanceof Error && /abort/i.test(e.name)) {
      throw new TinyFishError(504, `TinyResearch timed out after ${timeoutMs / 1000}s`);
    }
    throw new TinyFishError(502, `TinyResearch error: ${e instanceof Error ? e.message : String(e)}`);
  }

  clearTimeout(timer);
  return { run_id, report, citations: [...citations, ...finalCitations], finalCitations };
}
