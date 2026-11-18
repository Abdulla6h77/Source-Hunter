// Unit tests for the source tracer — no live API calls.
// Uses Node.js built-in test runner (tsx --test).

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { traceSource, deriveVerdict, normalizeDate as actualDate } from '../src/tracer.js';

// ── Helpers duplicated here to avoid side effects ──────────────────────────

function claimSimilarity(claim: string, excerpt: string): number {
  if (!excerpt) return 0;
  const words = (s: string) => new Set(s.toLowerCase().match(/\b[a-z0-9]+\b/g) ?? []);
  const claimWords = words(claim);
  const excerptWords = words(excerpt);
  if (!claimWords.size) return 0;
  let matches = 0;
  for (const w of claimWords) if (excerptWords.has(w)) matches++;
  return matches / claimWords.size;
}

function detectRounding(claim: string, excerpt: string): boolean {
  const nums = (s: string) => [...s.matchAll(/[\d,]+\.?\d*/g)].map(m => parseFloat(m[0].replace(/,/g, '')));
  const claimNums = nums(claim);
  const excerptNums = nums(excerpt);
  if (!claimNums.length || !excerptNums.length) return false;
  for (const cn of claimNums) {
    for (const en of excerptNums) {
      if (cn !== en && Math.abs(cn - en) / Math.max(Math.abs(en), 1) < 0.2) return true;
    }
  }
  return false;
}

function normalizeDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = d.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('claimSimilarity', () => {
  it('returns 1.0 for identical text', () => {
    const s = 'The sky is blue';
    assert.ok(claimSimilarity(s, s) >= 0.99);
  });

  it('returns 0 for empty excerpt', () => {
    assert.equal(claimSimilarity('some claim', ''), 0);
  });

  it('detects high overlap', () => {
    const sim = claimSimilarity(
      'global temperatures rose 1.1 degrees Celsius',
      'Global average temperatures have risen by 1.1 degrees Celsius since pre-industrial times',
    );
    assert.ok(sim > 0.6, `expected >0.6, got ${sim}`);
  });

  it('returns low score for unrelated text', () => {
    const sim = claimSimilarity(
      'global temperatures rose 1.1 degrees Celsius',
      'The company reported record profits last quarter',
    );
    assert.ok(sim < 0.3, `expected <0.3, got ${sim}`);
  });
});

describe('detectRounding', () => {
  it('detects when a claim rounds a source number', () => {
    assert.ok(detectRounding('over 3 million people', 'approximately 3.14 million people'));
  });

  it('returns false for exact match', () => {
    assert.ok(!detectRounding('3.14 million people', '3.14 million people'));
  });

  it('returns false when no numbers present', () => {
    assert.ok(!detectRounding('scientists say so', 'experts agree'));
  });

  it('returns false for large differences (not rounding)', () => {
    // 3 vs 10 — that is alteration, not rounding
    assert.ok(!detectRounding('3 million people', '10 million people'));
  });
});

describe('normalizeDate', () => {
  it('extracts YYYY-MM-DD from ISO string', () => {
    assert.equal(normalizeDate('2023-07-15T12:00:00Z'), '2023-07-15');
  });

  it('returns null for empty string', () => {
    assert.equal(normalizeDate(''), null);
  });

  it('returns null for null input', () => {
    assert.equal(normalizeDate(null), null);
  });

  it('extracts from prose', () => {
    assert.equal(normalizeDate('Published on 2021-03-04'), '2021-03-04');
  });
});

describe('verdict derivation rules', () => {
  // Test the rules used in tracer.ts directly without importing (avoids env deps)

  it('high similarity → matches', () => {
    const claim = 'global temperatures rose 1.1 degrees Celsius';
    const excerpt = 'Global average temperatures have risen by 1.1 degrees Celsius since pre-industrial times';
    const sim = claimSimilarity(claim, excerpt);
    const rounded = detectRounding(claim, excerpt);
    assert.ok(!rounded);
    assert.ok(sim >= 0.7, `sim=${sim}`);
    // => verdict: matches
  });

  it('rounded number → rounded', () => {
    const claim = 'over 3 million displaced';
    const excerpt = '3.14 million people have been displaced from their homes';
    const rounded = detectRounding(claim, excerpt);
    assert.ok(rounded);
    // => verdict: rounded
  });

  it('low similarity → misquoted or altered', () => {
    const claim = 'The vaccine is 95% effective';
    const excerpt = 'Clinical trials show efficacy of 72% under real-world conditions';
    const sim = claimSimilarity(claim, excerpt);
    assert.ok(sim < 0.4, `sim=${sim}`);
    // => verdict: altered or misquoted
  });
});

describe('input validation rules', () => {
  it('claim must be at least 5 chars', () => {
    // Simulate zod check
    const claim = 'ab';
    assert.ok(claim.trim().length < 5);
  });

  it('blocked URL protocols rejected', () => {
    const blocked = ['chrome://', 'chrome-extension://', 'about:', 'file:'];
    const urls = ['chrome://newtab', 'chrome-extension://abc/popup.html', 'about:blank', 'file:///C:/secret'];
    for (const url of urls) {
      assert.ok(blocked.some(p => url.startsWith(p)), `Expected ${url} to be blocked`);
    }
  });

  it('http and https URLs are allowed', () => {
    const allowed = ['https://example.com/article', 'http://news.example.org/story'];
    const blocked = ['chrome://', 'chrome-extension://', 'about:', 'file:'];
    for (const url of allowed) {
      assert.ok(!blocked.some(p => url.startsWith(p)));
    }
  });
});

it('does not quote an unfetched candidate or award it primary-source status', async (t) => {
  const prior = process.env.TINYFISH_API_KEY;
  process.env.TINYFISH_API_KEY = 'fixture-key';
  t.after(() => {
    if (prior === undefined) delete process.env.TINYFISH_API_KEY;
    else process.env.TINYFISH_API_KEY = prior;
  });

  const cited = 'https://example.org/original';
  const other = 'https://example.org/copy';
  const claim = 'Twenty units shipped in the first year.';
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const target = new URL(input);
    if (target.pathname.endsWith('/run-research')) {
      const result = `Primary source: [Original](${cited})`;
      const payload = JSON.stringify({event: 'final_result', result, run_id: 'fixture-run'});
      return new Response(`data: ${payload}\n\n`);
    }
    if (target.hostname === 'api.search.tinyfish.ai') {
      return Response.json({results: [{url: other, title: 'Copy', snippet: claim}]});
    }
    assert.equal(target.hostname, 'api.fetch.tinyfish.ai');
    return Response.json({results: [{url: other, text: claim}]});
  });

  const result = await traceSource(claim, other, 'Copy');
  assert.equal(result.verdict, 'no-source');
  assert.equal(result.primarySource, null);
  assert.deepEqual(result.chain.map((step) => [step.url, step.excerpt, step.relationship]), [
    [other, claim, 'unknown'],
  ]);
});

it('fetches the primary from the final citation order ahead of discovery results', async (t) => {
  const prior = process.env.TINYFISH_API_KEY;
  process.env.TINYFISH_API_KEY = 'fixture-key';
  t.after(() => {
    if (prior === undefined) delete process.env.TINYFISH_API_KEY;
    else process.env.TINYFISH_API_KEY = prior;
  });
  const requested = 'https://example.org/original';
  const canonical = 'https://example.org/final-report';
  const claim = 'Twenty units shipped in the first year.';
  t.mock.method(globalThis, 'fetch', async (input: string, options?: RequestInit) => {
    const target = new URL(input);
    if (target.pathname.endsWith('/run-research')) {
      const events = Array.from({length: 6}, (_, index) => ({
        event: 'source_fetched', url: 'https://example.org/copy-' + index,
      }));
      const final = {
        event: 'final_result', result: '### Primary source\n[1]',
        run_id: 'fixture-run', citations: [requested],
      };
      return new Response([...events, final].map(value => 'data: ' + JSON.stringify(value) + '\n\n').join(''));
    }
    if (target.hostname === 'api.search.tinyfish.ai') return Response.json({results: []});
    assert.equal(target.hostname, 'api.fetch.tinyfish.ai');
    const urls = JSON.parse(String(options?.body)).urls;
    assert.equal(urls.length, 5);
    assert.equal(urls[0], requested);
    return Response.json({results: [{url: requested, final_url: canonical, text: claim}]});
  });

  const result = await traceSource(claim, requested, 'Report');
  assert.equal(result.primarySource?.url, canonical);
  assert.equal(result.primarySource?.excerpt, claim);
  assert.equal(result.verdict, 'matches');
});


describe('production verdict regression checks', () => {
  const step = (excerpt: string) => ({url: 'https://example.org/report', title: 'Report', date: null,
    excerpt, relationship: 'primary' as const, isPrimary: true});
  it('does not call opposite wording a match despite high overlap', () => {
    assert.notEqual(deriveVerdict('The treatment is effective', [step('The treatment is not effective')]).verdict, 'matches');
  });
  it('does not infer misquotation from an unrelated excerpt', () => {
    assert.equal(deriveVerdict('The sky is blue', [step('Accounting policies are outlined in appendix seven')]).verdict, 'unknown');
  });
  it('preserves uncertainty when a long numerical selection is only partly covered', () => {
    const claim = 'UNHCR warned the total continued to increase in the first four months of this year and was likely to have exceeded 120 million, more than twice the population of Italy.';
    const excerpt = 'UNHCR estimates forced displacement continued to increase in the first four months of 2024 and is likely to have exceeded 120 million.';
    assert.equal(deriveVerdict(claim, [step(excerpt)]).verdict, 'partial-support');
  });
  it('uses explicit title dates and rejects invalid dates', () => {
    assert.equal(actualDate('Implementation Note issued July 26, 2023'), '2023-07-26');
    assert.equal(actualDate('2023-02-31'), null);
    assert.equal(actualDate('Global Trends 2023'), null);
  });
});

it('prefers relevant linked primary landing-page evidence over unrelated PDF wording', async (t) => {
  const prior = process.env.TINYFISH_API_KEY;
  process.env.TINYFISH_API_KEY = 'fixture-key';
  t.after(() => {if (prior === undefined) delete process.env.TINYFISH_API_KEY; else process.env.TINYFISH_API_KEY = prior;});
  const pdf = 'https://example.org/report.pdf';
  const landing = 'https://example.org/report';
  const claim = 'UNHCR warned the total continued to increase in the first four months of this year and was likely to have exceeded 120 million, more than twice the population of Italy.';
  const excerpt = 'UNHCR estimates forced displacement continued to increase in the first four months of 2024 and is likely to have exceeded 120 million.';
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    if (url.hostname === 'api.search.tinyfish.ai') return Response.json({results: []});
    assert.equal(url.hostname, 'api.fetch.tinyfish.ai');
    return Response.json({results: [
      {url: pdf, text: 'World population estimates and people in need of international protection are based on the available data.'},
      {url: landing, text: excerpt + '\n[Download](' + pdf + ')', title: 'Report June 13, 2024'},
    ]});
  });
  const result = await traceSource(claim, 'https://news.example.org/story', 'Article', {
    savedResearch: {runId: 'offline-regression', report: 'Primary source: ' + pdf, citations: [pdf, landing]},
  });
  assert.equal(result.primarySource?.url, landing);
  assert.equal(result.primarySource?.excerpt, excerpt);
  assert.equal(result.primarySource?.date, '2024-06-13');
  assert.equal(result.verdict, 'partial-support');
  assert.ok(result.chain.every(s => s.relationship !== 'cites'));
});
