// Shared types (duplicated from backend for extension use — no server dep).

export type ClaimVerdict =
  | 'partial-support'
  | 'matches'
  | 'rounded'
  | 'altered'
  | 'misquoted'
  | 'unsupported'
  | 'no-source'
  | 'unknown';

export interface CitationStep {
  url: string;
  title: string;
  date: string | null;
  excerpt: string;
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
  isPartial: boolean;
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

export const BACKEND_URL = 'http://localhost:3737';
