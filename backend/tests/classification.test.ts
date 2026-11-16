// Unit tests for citation chain classification, rounding detection, and verdicts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function extractNumbers(s: string): number[] {
  return [...s.matchAll(/(?:\b|\$)([\d,]+\.?\d*)\b/g)]
    .map(m => parseFloat(m[1].replace(/,/g, '')))
    .filter(n => !isNaN(n));
}

function detectRounding(claim: string, excerpt: string): boolean {
  const claimNums = extractNumbers(claim);
  const excerptNums = extractNumbers(excerpt);
  if (!claimNums.length || !excerptNums.length) return false;

  for (const cn of claimNums) {
    for (const en of excerptNums) {
      if (cn === en) continue;
      const diff = Math.abs(cn - en);
      const relDiff = diff / Math.max(Math.abs(en), 1);
      if (relDiff > 0 && relDiff <= 0.15) {
        return true;
      }
    }
  }
  return false;
}

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

describe('Detection of Rounded vs Exact Numbers', () => {
  it('correctly flags rounding: "120 million" vs "122.6 million"', () => {
    assert.strictEqual(detectRounding('Over 120 million people displaced', 'An estimated 122.6 million individuals remain forcibly displaced'), true);
  });

  it('correctly rejects large differences as not rounding: "100" vs "500"', () => {
    assert.strictEqual(detectRounding('Over 100 million people', 'An estimated 500 million people'), false);
  });

  it('handles percentage rounding: "25%" vs "24.7%"', () => {
    assert.strictEqual(detectRounding('approximately 25% of students', 'exact figures show 24.7% of surveyed youth'), true);
  });
});

describe('Misquoted and Altered Detection', () => {
  it('identifies exact verbatim overlap as matches (similarity >= 0.6)', () => {
    const claim = 'Global atmospheric carbon dioxide reached 419.3 parts per million in 2023';
    const excerpt = 'NOAA reports that global atmospheric carbon dioxide reached 419.3 parts per million in 2023 at Mauna Loa';
    assert.ok(claimSimilarity(claim, excerpt) >= 0.6);
  });

  it('identifies paraphrased/altered wording (0.3 <= similarity < 0.6)', () => {
    const claim = 'Renewable solar energy installations grew rapidly across the nation during 2024';
    const excerpt = 'Official records indicate that solar energy across the nation experienced modest adoption rates in 2024';
    const sim = claimSimilarity(claim, excerpt);
    assert.ok(sim >= 0.3 && sim < 0.6, `expected 0.3 <= sim < 0.6, got ${sim}`);
  });

  it('flags unrelated or fabricated text as misquoted (similarity < 0.2)', () => {
    const claim = 'The moon is composed primarily of blue cheese';
    const excerpt = 'Apollo lunar samples indicate high concentrations of basalt, anorthosite, and pyroxene';
    assert.ok(claimSimilarity(claim, excerpt) < 0.2);
  });
});
