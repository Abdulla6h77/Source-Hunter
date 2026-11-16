// Shared types for Source Hunter backend and extension.

export type ClaimVerdict =
  | 'matches'       // wording matches the original closely
  | 'rounded'       // number rounded (e.g. 3.14 → "over 3")
  | 'altered'       // wording meaningfully changed
  | 'misquoted'     // attributed to a source that doesn't say it
  | 'unsupported'   // current page claims X but source says Y
  | 'no-source'     // could not find a primary source
  | 'unknown';      // insufficient evidence to judge

export interface CitationStep {
  url: string;
  title: string;
  /** ISO-8601 date string, or null when unknown */
  date: string | null;
  /** Exact verbatim wording found at this source */
  excerpt: string;
  /** How this step relates to the next earlier step */
  relationship: 'cites' | 'similar' | 'primary' | 'circular' | 'unknown';
  isPrimary: boolean;
}

export interface TraceResult {
  claim: string;
  verdict: ClaimVerdict;
  verdictExplanation: string;
  chain: CitationStep[];
  primarySource: CitationStep | null;
  refutingSource?: CitationStep;
  noSourceReason?: string;
  researchRunId: string | null;
  tracedAt: string;
  durationMs: number;
  /** Partial results returned when trace was interrupted */
  isPartial: boolean;
}

export interface TraceRequest {
  claim: string;
  pageUrl: string;
  pageTitle: string;
}

export interface TraceError {
  error: string;
  code: number;
  retryable: boolean;
}

export type TraceResponse = TraceResult | TraceError;

export function isTraceError(r: TraceResponse): r is TraceError {
  return 'error' in r;
}
