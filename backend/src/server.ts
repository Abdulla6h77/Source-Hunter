// Express server for Source Hunter backend.
// API key stays server-side; extension only calls /trace.

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { traceSource } from './tracer.js';
import { TinyFishError } from './tinyfish.js';
import type { TraceResponse } from './types.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3737', 10);

// CORS: allow extension origin via chrome-extension:// scheme
// In production, restrict to your extension's ID.
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
      cb(null, true);
    } else {
      cb(new Error('CORS: origin not allowed'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '64kb' }));

// ── Health check ─────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'source-hunter-backend', timestamp: new Date().toISOString() });
});

// ── Trace endpoint ────────────────────────────────────────────────────────

const traceSchema = z.object({
  claim: z.string().trim().min(5, 'Claim must be at least 5 characters').max(2000),
  pageUrl: z.string().url('pageUrl must be a valid URL').max(2048),
  pageTitle: z.string().max(500).default(''),
});

type TraceInput = z.infer<typeof traceSchema>;

function validateTrace(body: unknown) {
  const parsed = traceSchema.safeParse(body);
  if (!parsed.success) {
    return {error: parsed.error.issues.map(issue => issue.message).join('; '), code: 400, retryable: false};
  }
  const url = new URL(parsed.data.pageUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return {error: 'Page URL must be a public HTTP or HTTPS URL.', code: 400, retryable: false};
  }
  return parsed.data;
}

async function performTrace(input: TraceInput): Promise<TraceResponse> {
  try {
    return await traceSource(input.claim, input.pageUrl, input.pageTitle);
  } catch (error) {
    if (error instanceof TinyFishError) {
      return {error: error.message, code: error.status, retryable: [429, 502, 503, 504].includes(error.status)};
    }
    console.error('[server] trace failed:', error instanceof Error ? error.name : 'Unknown');
    return {error: 'Internal server error.', code: 500, retryable: false};
  }
}

app.post('/trace', async (req, res) => {
  const input = validateTrace(req.body);
  if ('error' in input) {
    res.status(input.code).json(input);
    return;
  }
  const result = await performTrace(input);
  res.status('error' in result ? Math.min(result.code, 599) : 200).json(result);
});

const jobs = new Map<string, {input: string; expiresAt: number; result?: TraceResponse}>();
const jobIdSchema = z.string().uuid();

app.post('/trace-jobs', (req, res) => {
  const input = validateTrace(req.body);
  if ('error' in input) {
    res.status(input.code).json(input);
    return;
  }
  const jobId = jobIdSchema.safeParse(req.body?.jobId ?? randomUUID());
  if (!jobId.success) {
    res.status(400).json({error: 'Invalid trace job ID.', code: 400, retryable: false});
    return;
  }
  for (const [id, job] of jobs) {
    if (job.expiresAt <= Date.now()) jobs.delete(id);
  }
  const serialized = JSON.stringify(input);
  const existing = jobs.get(jobId.data);
  if (existing) {
    if (existing.input !== serialized) {
      res.status(409).json({error: 'Trace job ID already belongs to another claim.', code: 409, retryable: false});
      return;
    }
    res.status(202).json({id: jobId.data});
    return;
  }
  if ([...jobs.values()].filter(job => !job.result).length >= 3) {
    res.status(429).json({error: 'Three traces are already running.', code: 429, retryable: true});
    return;
  }
  const job: {input: string; expiresAt: number; result?: TraceResponse} = {
    input: serialized, expiresAt: Infinity,
  };
  jobs.set(jobId.data, job);
  res.status(202).json({id: jobId.data});
  void performTrace(input).then(result => {
    job.result = result;
    job.expiresAt = Date.now() + 12 * 60 * 60_000;
  });
});

app.get('/trace-jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  res.setHeader('Cache-Control', 'no-store');
  if (!job || job.expiresAt <= Date.now()) {
    res.status(404).json({error: 'Trace job is unavailable. Check whether the backend restarted.', code: 404, retryable: true});
    return;
  }
  res.json(job.result ? {status: 'done', result: job.result} : {status: 'running'});
});

// ── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`[source-hunter] Backend running on http://localhost:${PORT}`);
  if (!process.env.TINYFISH_API_KEY) {
    console.warn('[source-hunter] WARNING: TINYFISH_API_KEY not set. Add it to .env');
  }
});

export default app;
