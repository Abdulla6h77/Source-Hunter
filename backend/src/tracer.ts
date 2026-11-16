// Source-tracing engine: takes a claim + page URL and builds a citation chain
// using TinyResearch (primary) + TinyFish Search/Fetch for corroboration.

import { z } from 'zod';
import { tfRequest, tfResearch, ENDPOINTS, TinyFishError } from './tinyfish.js';
import type { CitationStep, ClaimVerdict, TraceResult } from './types.js';

// ── Zod schemas for TinyFish raw responses ────────────────────────────────

const searchResultSchema = z.object({
  results: z.array(z.object({
    url: z.string(),
    title: z.string(),
    snippet: z.string().optional(),
    date: z.string().nullable().optional(),
  })),
});

const fetchResultSchema = z.object({
  results: z.array(z.object({
    url: z.string(),
    final_url: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    text: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    published_date: z.string().nullable().optional(),
  })),
  errors: z.array(z.object({ url: z.string(), error: z.unknown().optional() })).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────

/** Extract an ISO date from a TinyFish date string or null. */
function normalizeDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = d.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/** Score how well an excerpt matches the original claim (0–1). */
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

/** Extract numbers and units from a string. */
function extractNumbers(s: string): number[] {
  return [...s.matchAll(/(?:\b|\$)([\d,]+\.?\d*)\b/g)]
    .map(m => parseFloat(m[1].replace(/,/g, '')))
    .filter(n => !isNaN(n));
}

/** Detect rounding: e.g. "3.14 million" in source → "over 3 million" in claim. */
function detectRounding(claim: string, excerpt: string): boolean {
  const claimNums = extractNumbers(claim);
  const excerptNums = extractNumbers(excerpt);
  if (!claimNums.length || !excerptNums.length) return false;

  for (const cn of claimNums) {
    for (const en of excerptNums) {
      if (cn === en) continue;
      const diff = Math.abs(cn - en);
      const relDiff = diff / Math.max(Math.abs(en), 1);
      // Rounding: difference is non-zero, within 15%, or integer approximation
      if (relDiff > 0 && relDiff <= 0.15) {
        return true;
      }
    }
  }
  return false;
}

/** Build a verdict from the chain of steps and the original claim. */
function deriveVerdict(claim: string, chain: CitationStep[]): {
  verdict: ClaimVerdict;
  explanation: string;
} {
  if (!chain.length) {
    return { verdict: 'no-source', explanation: 'No traceable source chain could be established.' };
  }

  const primary = chain.find(s => s.isPrimary) ?? chain[chain.length - 1];
  if (!primary) {
    return { verdict: 'no-source', explanation: 'Citation trail did not reach a primary source.' };
  }

  // Check for circular citation
  const urls = chain.map(s => s.url);
  if (new Set(urls).size < urls.length) {
    return { verdict: 'unsupported', explanation: 'Citation trail forms a circular loop; no independent primary source found.' };
  }

  const sim = claimSimilarity(claim, primary.excerpt);
  const thresholds = /\b(?:over|under|exceed(?:ed|s)?|at least|more than|less than)\b/i;
  const qualifiers = /\b(?:likely|estimated?|approximately|preliminary)\b/i;
  const rounded = !thresholds.test(claim) && detectRounding(claim, primary.excerpt);

  if (thresholds.test(claim) && qualifiers.test(primary.excerpt) && !qualifiers.test(claim)) {
    return {
      verdict: 'altered',
      explanation: 'The cited source describes a qualified estimate. Check its reference date and uncertainty before treating the claim as a measured total.',
    };
  }

  if (rounded) {
    return {
      verdict: 'rounded',
      explanation: `The primary source states "${primary.excerpt.slice(0, 200)}", but the claim uses a rounded or approximated figure.`,
    };
  }

  if (sim >= 0.6) {
    return {
      verdict: 'matches',
      explanation: `Claim matches the primary source (${Math.round(sim * 100)}% word overlap). Primary: "${primary.excerpt.slice(0, 200)}"`,
    };
  }

  if (sim >= 0.3) {
    return {
      verdict: 'unknown',
      explanation: 'The original record is linked below. Compare its wording and context before judging whether it supports the full claim.',
    };
  }

  if (sim < 0.2) {
    return {
      verdict: 'misquoted',
      explanation: `Claim appears to misquote or misattribute the source. Actual source says: "${primary.excerpt.slice(0, 200)}"`,
    };
  }

  return {
    verdict: 'unknown',
    explanation: 'Insufficient evidence to determine whether the claim matches the source.',
  };
}

// ── Citation extraction from TinyResearch report ──────────────────────────

interface ParsedCitation {
  url: string;
  title: string;
  date: string | null;
  excerpt: string;
}

function extractCitationsFromReport(report: string, rawCitations: unknown[]): ParsedCitation[] {
  const results: ParsedCitation[] = [];

  // Pull structured citations from TinyResearch if provided
  if (Array.isArray(rawCitations)) {
    for (const c of rawCitations) {
      if (typeof c === 'string' && /^https?:\/\//i.test(c)) {
        if (!results.some(item => item.url === c)) {
          results.push({url: c, title: '', date: null, excerpt: ''});
        }
      } else if (typeof c === 'object' && c !== null) {
        const obj = c as Record<string, unknown>;
        const url = typeof obj.url === 'string' ? obj.url : '';
        const title = typeof obj.title === 'string' ? obj.title : '';
        const date = typeof obj.date === 'string' ? normalizeDate(obj.date) : null;
        const excerpt = typeof obj.excerpt === 'string' ? obj.excerpt : (typeof obj.snippet === 'string' ? obj.snippet : '');
        if (url && !results.find(r => r.url === url)) {
          results.push({ url, title, date, excerpt });
        }
      }
    }
  }

  // Extract inline Markdown links from the report text: [text](url)
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(report)) !== null) {
    const title = m[1];
    const url = m[2];
    const existing = results.find(r => r.url === url);
    const pos = m.index;
    const excerpt = report.slice(Math.max(0, pos - 150), pos + 150).trim();
    if (!existing) {
      results.push({ url, title, date: null, excerpt });
    } else if (!existing.excerpt && excerpt) {
      existing.excerpt = excerpt;
    }
  }

  // Also extract raw HTTP/HTTPS URLs mentioned in text
  const rawUrlRe = /(https?:\/\/[^\s"'<>\)]+)/g;
  while ((m = rawUrlRe.exec(report)) !== null) {
    const url = m[1].replace(/[.,;:]+$/, '');
    if (!results.find(r => r.url === url)) {
      const pos = m.index;
      const excerpt = report.slice(Math.max(0, pos - 120), pos + 120).trim();
      results.push({ url, title: new URL(url).hostname, date: null, excerpt });
    }
  }

  return results;
}

// ── Fetch individual pages for exact wording ─────────────────────────────

async function fetchPages(urls: string[]): Promise<Map<string, { url: string; title: string; text: string; date: string | null }>> {
  const result = new Map<string, { url: string; title: string; text: string; date: string | null }>();
  if (!urls.length) return result;

  try {
    const raw = await tfRequest(ENDPOINTS.fetch, {
      urls: urls.slice(0, 5), // cap at 5 pages per trace
      format: 'markdown',
      links: true,
      ttl: 0,
      per_url_timeout_ms: 20_000,
    }, 60_000);

    const parsed = fetchResultSchema.parse(raw);
    for (const page of parsed.results) {
      const url = page.final_url ?? page.url;
      if (page.text) {
        result.set(page.url, {
          url,
          title: page.title ?? '',
          text: page.text,
          date: normalizeDate(page.published_date ?? page.date),
        });
      }
    }
  } catch (e) {
    // Preserve the unresolved result when Fetch is unavailable.
    console.warn('[tracer] fetch pages failed:', e instanceof Error ? e.message : e);
  }

  return result;
}

// The static Fetch API can omit plain-text files. Only fetch an explicitly
// designated primary data file from this configured public publisher.
async function fetchPlainDataset(url: string): Promise<string | undefined> {
  try {
    const target = new URL(url);
    if (target.origin !== 'https://gml.noaa.gov' ||
        !target.pathname.startsWith('/webdata/') || !target.pathname.endsWith('.txt')) return;
    const response = await fetch(target, {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('text/plain') || !response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    for (;;) {
      const {done, value} = await reader.read();
      if (done) return text + decoder.decode();
      total += value.length;
      if (total > 128 * 1024) {
        await reader.cancel();
        return;
      }
      text += decoder.decode(value, {stream: true});
    }
  } catch {
    return;
  }
}

/** Extract the best matching excerpt from a page's text for a given claim. */
function bestExcerpt(claim: string, text: string, maxLen = 400): string {
  if (!text) return '';
  const years = [...claim.matchAll(/\b(?:18|19|20)\d{2}\b/g)];
  if (years.length === 1) {
    const year = years[0][0];
    const row = text.split(/\r?\n/).find(line =>
      new RegExp('^\\s*' + year + '\\s+\\d+(?:\\.\\d+)?\\s+\\d+(?:\\.\\d+)?\\s*$').test(line));
    if (row) return row.trim();
  }
  const sentences = text.split(/\r?\n|(?<=[.!?])\s+/);
  const claimNumbers = extractNumbers(claim).filter(n => n < 1800 || n > 2100);
  const names = [...claim.matchAll(/\b[A-Z][a-z]{3,}\b/g)].map(match => match[0].toLowerCase());
  const namesInClaim = new Set(names);
  let best = '';
  let bestSim = 0;
  let bestScore = 0;
  for (const sentence of sentences) {
    if (sentence.length < 14 || sentence.length > 2000 || sentence.trimEnd().endsWith('?')) continue;
    const sim = claimSimilarity(claim, sentence);
    const numbers = extractNumbers(sentence);
    const words = new Set(sentence.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []);
    const nameScore = [...namesInClaim].filter(name => words.has(name)).length / Math.max(namesInClaim.size, 1);
    const score = sim + (sim >= 0.18 && claimNumbers.some(n => numbers.includes(n)) ? 0.35 : 0)
      + (sim >= 0.18 ? 0.2 * nameScore : 0);
    if (score > bestScore) {
      bestScore = score;
      bestSim = sim;
      best = sentence;
    }
  }
  return bestSim >= 0.18 ? best.slice(0, maxLen) : '';
}

/** Read an explicit source designation without assuming the last citation is primary. */
function designatedPrimary(report: string, citations: unknown[]): string | undefined {
  if (/^[ \t]*(?:\*\*)?Primary source:[ \t]*(?:\*\*)?[ \t]*none[. \t]*$/im.test(report)) return;
  const designation = report.match(
    /^[ \t]*(?:#{1,6}[ \t]+|[-*][ \t]+)?(?:\*\*)?(?:Earliest[ \t]+)?(?:verified[ \t]+)?Primary source(?:\*\*)?(?:[ \t]*:(?:\*\*)?)?[ \t]*(?:\r?\n[ \t]*(?:[-*][ \t]+)?)?(?:\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)|\[(\d+)\])/im,
  );
  if (designation) {
    const [, linked, bare, number] = designation;
    if (linked || bare) return (linked || bare).replace(/[.,;*]+$/, "");
    return citationUrl(citations[Number(number) - 1]);
  }

  const conclusion = report.split(/\r?\n/).find(line => /\bthe original primary source is\b/i.test(line));
  const citationsInConclusion = [...(conclusion ?? '').matchAll(/\[(\d+)\]/g)];
  if (citationsInConclusion.length === 1) {
    return citationUrl(citations[Number(citationsInConclusion[0][1]) - 1]);
  }

  const sections = report.split(/^(?=#{1,3}[ \t])/m);
  for (const section of sections) {
    const [heading, ...lines] = section.split(/\r?\n/);
    if (!/\b(?:the primary source|earliest identifiable primary source)\b/i.test(heading)) continue;
    const link = lines.find(line => /URL \(official landing page\)/i.test(line));
    const url = link?.match(/https?:\/\/[^\s<>]+/)?.[0];
    if (url && citations.some(citation => citationUrl(citation) === url)) return url;
  }
  return undefined;
}

function citationUrl(candidate: unknown): string | undefined {
  if (typeof candidate === "string") return candidate;
  if (candidate && typeof candidate === "object" && "url" in candidate && typeof candidate.url === "string") {
    return candidate.url;
  }
  return undefined;
}

function designatedRefutation(report: string, citations: unknown[], pageUrl: string) {
  const statement = report.split(/\r?\n/).find(line => /\bprimary refuting evidence\b.+\[\d+\]/i.test(line));
  if (!statement) return undefined;
  for (const [, number] of statement.matchAll(/\[(\d+)\]/g)) {
    const url = citationUrl(citations[Number(number) - 1]);
    if (url === pageUrl) return url;
  }
  return undefined;
}

function independentTranscript(report: string, citations: unknown[]) {
  const lines = report.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const clause = line.match(/\b(?:video|audio) transcript\b.*\bindependently records\b/i);
    if (!clause || clause.index === undefined) continue;
    let excerpt = line.slice(clause.index);
    if (!/\[\d+\]/.test(excerpt)) {
      const next = lines.slice(index + 1).find(value => value.trim());
      if (next?.trimStart().startsWith('>')) excerpt = next;
    }
    const references = [...excerpt.matchAll(/\[(\d+)\]/g)];
    if (references.length === 1) return citationUrl(citations[Number(references[0][1]) - 1]);
  }
  return undefined;
}

function archiveDownload(primaryUrl?: string): string | undefined {
  const match = primaryUrl?.match(/^https:\/\/ntrs\.nasa\.gov\/citations\/(\d+)\/?$/);
  if (!match) return undefined;
  return `https://ntrs.nasa.gov/api/citations/${match[1]}/downloads/${match[1]}.pdf`;
}

// ── TinyResearch query builder ────────────────────────────────────────────

function buildResearchQuery(claim: string, pageUrl: string): string {
  return [
    `Trace the original source of this claim: "${claim}"`,
    `The claim was found at: ${pageUrl}`,
    'Follow citations backward to find the earliest primary source (a study, official report, filing, or primary interview).',
    'For each step in the citation chain, provide: the exact URL, publication date, and the exact verbatim wording used.',
    'Finish with exactly one standalone line: Primary source: https://... (the original publication URL), or Primary source: none.',
    'If the claim has been changed, rounded, or misquoted compared to the original source, say so explicitly.',
    'If no primary source can be found, say "no original source found" and explain why.',
    'For a false claim, identify the original evidence that refutes it as the primary source and clearly say the claim is unsupported.',
    'Do not fabricate sources, dates, or quotations.',
  ].join(' ');
}

// ── Main trace function ───────────────────────────────────────────────────

export async function traceSource(
  claim: string,
  pageUrl: string,
  pageTitle: string,
  options: {
    onResearchReport?: (report: string, runId: string | null, citations: unknown[]) => void;
    savedResearch?: {report: string; runId: string; citations: unknown[]};
  } = {},
): Promise<TraceResult> {
  const start = Date.now();

  // --- Step 1: TinyResearch (primary deep trace) ---
  let report = '';
  let researchRunId: string | null = null;
  let rawCitations: unknown[] = [];
  let finalCitations: unknown[] = [];
  let isPartial = false;

  const query = buildResearchQuery(claim, pageUrl);

  if (options.savedResearch) {
    ({ report, runId: researchRunId, citations: finalCitations } = options.savedResearch);
    rawCitations = finalCitations;
  } else {
    try {
      const { run_id, report: r, citations, finalCitations: orderedCitations } = await tfResearch(
        query,
        (evt) => {
          // Progress events are consumed but not persisted per request
          if (evt.event === 'error') {
            console.warn('[tracer] research event error:', evt.error);
          }
        },
      );
      report = r;
      researchRunId = run_id;
      rawCitations = citations;
      finalCitations = orderedCitations;
    } catch (e) {
      if (e instanceof TinyFishError && e.status === 504) {
        // Timeout — partial result
        isPartial = true;
        console.warn('[tracer] TinyResearch timed out — returning partial result');
      } else {
        throw e;
      }
    }
  }

  options.onResearchReport?.(report, researchRunId, finalCitations);

  // --- Step 2: Extract citations from TinyResearch output ---
  const parsedCitations = extractCitationsFromReport(report, rawCitations);

  // --- Step 3: TinyFish Search for candidate & primary sources ---
  let searchResults: Array<{ url: string; title: string; snippet?: string; date?: string | null }> = [];
  try {
    const searchUrl = new URL(ENDPOINTS.search);
    searchUrl.searchParams.set('query', `${claim} official report study data source`);
    searchUrl.searchParams.set('language', 'en');
    searchUrl.searchParams.set('purpose', 'Find the original source, study, or report this claim comes from.');
    const rawSearch = await tfRequest(searchUrl.toString(), undefined, 20_000);
    const parsed = searchResultSchema.parse(rawSearch);
    searchResults = parsed.results.slice(0, 5);
  } catch (e) {
    console.warn('[tracer] search corroboration failed:', e instanceof Error ? e.message : e);
  }

  // Combine URLs to fetch
  for (const s of searchResults) {
    if (!parsedCitations.some(c => c.url === s.url)) {
      parsedCitations.push({
        url: s.url,
        title: s.title,
        date: s.date ? normalizeDate(s.date) : null,
        excerpt: s.snippet || '',
      });
    }
  }

  const primaryUrl = designatedPrimary(report, finalCitations);
  const refutingUrl = primaryUrl ? undefined : designatedRefutation(report, finalCitations, pageUrl);
  const primaryDownload = archiveDownload(primaryUrl);
  const transcript = primaryDownload ? independentTranscript(report, finalCitations) : undefined;
  const priorities = [primaryUrl, primaryDownload, transcript, refutingUrl].filter((url): url is string => Boolean(url));
  const urls = [...new Set([...priorities, ...parsedCitations.map(c => c.url)])].slice(0, 5);
  const pageData = await fetchPages(urls);
  if (primaryUrl && !pageData.has(primaryUrl)) {
    const text = await fetchPlainDataset(primaryUrl);
    if (text) pageData.set(primaryUrl, {url: primaryUrl, title: 'NOAA Global Monitoring Laboratory data', text, date: null});
  }

  const chain: CitationStep[] = [];
  const pageContent = new Map<string, string>();
  const preferredPrimary = [transcript, primaryDownload, primaryUrl].find(url => {
    const page = url && pageData.get(url);
    return page && bestExcerpt(claim, page.text);
  });
  const trailUrls = [...urls.filter(url => url !== preferredPrimary), ...urls.filter(url => url === preferredPrimary)];
  let refutingSource: CitationStep | undefined;
  for (const url of trailUrls) {
    const page = pageData.get(url);
    if (!page || chain.some(step => step.url === page.url)) continue;
    const excerpt = bestExcerpt(claim, page.text);
    if (!excerpt) continue;
    const citation = parsedCitations.find(item => item.url === url);
    const isPrimary = url === preferredPrimary;
    const catalog = primaryUrl ? pageData.get(primaryUrl) : undefined;
    pageContent.set(page.url, page.text);
    const step: CitationStep = {
      url: page.url,
      title: page.title || catalog?.title || citation?.title || 'Unknown title',
      date: url === primaryDownload ? catalog?.date ?? page.date : page.date,
      excerpt,
      relationship: isPrimary ? 'primary' : 'unknown',
      isPrimary,
    };
    if (url === refutingUrl && /\b(?:not|never|cannot|isn’t|isn't)\b/i.test(excerpt)) refutingSource = step;
    chain.push(step);
  }

  for (let i = 0; i < chain.length - 1; i++) {
    const nextLink = chain[i + 1].url;
    const text = pageContent.get(chain[i].url) ?? '';
    if (text.includes(`](${nextLink})`)) chain[i].relationship = 'cites';
  }

  const primarySource = chain.find(s => s.isPrimary) ?? null;
  if (!primarySource) {
    return {
      claim,
      verdict: refutingSource ? 'unsupported' : isPartial ? 'unknown' : 'no-source',
      verdictExplanation: refutingSource
        ? 'The fetched source directly contradicts the claim. Its original attribution remains unresolved.'
        : isPartial
        ? 'The research was interrupted before a primary source could be verified.'
        : 'TinyResearch could not establish a verifiable primary source for this claim.',
      chain,
      primarySource: null,
      refutingSource,
      noSourceReason: report.slice(0, 500) || 'No research output.',
      researchRunId,
      tracedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      isPartial,
    };
  }

  const { verdict, explanation } = deriveVerdict(claim, [primarySource]);

  return {
    claim,
    verdict,
    verdictExplanation: explanation,
    chain,
    primarySource,
    researchRunId,
    tracedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    isPartial,
  };
}
