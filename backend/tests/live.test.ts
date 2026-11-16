// live.test.ts — integration test against live TinyFish API.
// Run: npx tsx tests/live.test.ts
// Requires TINYFISH_API_KEY in .env

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { traceSource } from '../src/tracer.js';
import { tfRequest } from '../src/tinyfish.js';

const TEST_CLAIMS = [
  {
    id: 'noaa-carbon-2023',
    claim: 'Global atmospheric carbon dioxide reached 419.3 parts per million in 2023',
    pageUrl: 'https://www.noaa.gov/news-release/carbon-dioxide-levels-race-past-milestones-in-2023',
    pageTitle: 'NOAA carbon dioxide levels in 2023',
  },
  {
    id: 'displacement-120-million',
    claim: 'Over 120 million people are forcibly displaced worldwide according to UNHCR',
    pageUrl: 'https://www.unhcr.org/about-unhcr/who-we-are/figures-at-a-glance',
    pageTitle: 'UNHCR Figures at a Glance',
  },
  {
    id: 'great-wall-incorrect',
    claim: 'The Great Wall of China is the only human-made object that can be seen from space',
    pageUrl: 'https://esrs.jsc.nasa.gov/FAQ/',
    pageTitle: 'NASA Earth Observations FAQ',
    expectIncorrect: true,
  },
  {
    id: 'moon-landing',
    claim: 'Neil Armstrong was the first person to walk on the Moon in 1969',
    pageUrl: 'https://www.nasa.gov/specials/60counting/spaceflight.html',
    pageTitle: 'NASA 60 Years and Counting',
  },
  {
    id: 'federal-funds-july-2023',
    claim: 'raise the target range for the federal funds rate to 5-1/4 to 5-1/2 percent',
    pageUrl: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20230726a.htm',
    pageTitle: 'July 26, 2023 FOMC statement',
  },
];

const LABEL_LIVE = '[LIVE]';

async function main() {
  console.log('Source Hunter — Live Integration Test');
  console.log('=====================================');
  console.log('Note: TinyResearch Deep typically takes 5–20 minutes.\n');

  if (!process.env.TINYFISH_API_KEY) {
    console.error('ERROR: TINYFISH_API_KEY not set. Add it to backend/.env');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  // Run the first test claim only (full 5-claim demo requires ~20 minutes)
  // Set RUN_ALL=1 to run all test cases
  const selected = process.env.RUN_CASE
    ? TEST_CLAIMS.find(test => test.id === process.env.RUN_CASE)
    : TEST_CLAIMS[0];
  if (!selected) throw new Error('RUN_CASE must be a known demo case ID.');
  const toRun = process.env.RUN_ALL === '1' ? TEST_CLAIMS : [selected];
  const savedId = process.env.RUN_RESEARCH_ID;
  if (savedId && (toRun.length !== 1 || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(savedId))) {
    throw new Error('Use one saved research UUID with a single case.');
  }
  mkdirSync('.local', {recursive: true});

  for (const tc of toRun) {
    console.log(`\n--- Test: ${tc.id} ---`);
    console.log(`Claim: "${tc.claim}"`);
    console.log(`Page:  ${tc.pageUrl}`);
    const start = Date.now();

    try {
      let savedResearch;
      if (savedId) {
        const saved = await tfRequest(`https://agent.tinyfish.ai/v1/research-run/${savedId}`) as {
          status: string;
          query: string;
          deep_result?: {result: string; citations?: unknown[]};
        };
        const prefix = `Trace the original source of this claim: "${tc.claim}" The claim was found at: ${tc.pageUrl} `;
        if (saved.status !== 'COMPLETED' || !saved.query.startsWith(prefix) || !saved.deep_result?.result) {
          throw new Error('The saved report does not match this demo claim or is incomplete.');
        }
        savedResearch = {report: saved.deep_result.result, runId: savedId, citations: saved.deep_result.citations ?? []};
      }
      const result = await traceSource(tc.claim, tc.pageUrl, tc.pageTitle, {
        savedResearch,
        onResearchReport: (report, runId, citations) => {
          writeFileSync(`.local/${tc.id}-research.json`, JSON.stringify({runId, citations, report}, null, 2));
        },
      });
      writeFileSync(`.local/${tc.id}-trace.json`, JSON.stringify(result, null, 2));
      const duration = ((Date.now() - start) / 1000).toFixed(1);

      console.log(`${LABEL_LIVE} TinyResearch run: ${result.researchRunId ?? 'unavailable'}`);
      console.log(`${LABEL_LIVE} Verdict: ${result.verdict}`);
      console.log(`${LABEL_LIVE} Duration: ${duration}s`);
      console.log(`${LABEL_LIVE} Chain length: ${result.chain.length}`);
      console.log(`${LABEL_LIVE} Explanation: ${result.verdictExplanation.slice(0, 200)}`);

      if (result.chain.length > 0) {
        console.log(`${LABEL_LIVE} Steps:`);
        for (const step of result.chain) {
          const primary = step.isPrimary ? ' [PRIMARY]' : '';
          console.log(`  ${primary}  ${step.url}`);
          console.log(`       Date: ${step.date ?? 'unknown'}`);
          console.log(`       Excerpt: "${step.excerpt.slice(0, 100)}..."`);
        }
      }

      if (!result.researchRunId || result.isPartial) {
        throw new Error('TinyResearch did not complete with a run ID.');
      }
      if (tc.expectIncorrect) {
        if (result.verdict !== 'unsupported' || !result.refutingSource) {
          throw new Error('The incorrect claim requires fetched evidence contradicting it.');
        }
      } else if (!result.primarySource || !result.chain.length) {
        throw new Error('No fetched primary evidence was verified.');
      }
      passed++;
      console.log('PASS: evidence matched the smoke-test expectation.');

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`❌ FAIL — ${msg}`);
      failed++;
    }
  }

  console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
