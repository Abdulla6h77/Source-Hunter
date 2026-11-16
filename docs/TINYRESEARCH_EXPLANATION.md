# Source Hunter — TinyFish API Integration Architecture

## Overview of TinyFish Usage

Source Hunter is built specifically around the **TinyFish API Ecosystem**, employing multiple endpoints where each contributes meaningfully to the verification lifecycle.

---

## 1. Primary Engine: TinyResearch (`/v1/automation/run-research`)
* **Role:** Substantive claim tracing and deep autonomous citation investigation.
* **Why it matters:** Unlike standard keyword search engines that simply return high-ranking SEO blog copies, TinyResearch deploys an autonomous research workflow across the live web:
  - It searches across primary academic literature, official government portals, press archives, and SEC/regulatory filings.
  - It tracks citations backwards, traversing from aggregator articles to original studies.
  - It streams synthesis events (`created`, `plan_updated`, `sources_searching`, `synthesis_delta`, `citations`) via Server-Sent Events (SSE).
* **Implementation:** `backend/src/tinyfish.ts` connects to `https://agent.tinyfish.ai/v1/automation/run-research` with `mode: "deep"`, streaming events and parsing structured source citations.

---

## 2. Corroboration Engine: TinyFish Search (`api.search.tinyfish.ai`)
* **Role:** Secondary candidate discovery and cross-verification.
* **Why it matters:** Gathers candidate pages and alternate perspectives across news and fact-checking domains, ensuring that the citation trail isn't limited to a single narrative thread.
* **Implementation:** Handled via GET query in `backend/src/tracer.ts` with specified query intent (`"Find the original source, study, or report this claim comes from"`).

---

## 3. Verbatim Verification: TinyFish Fetch (`api.fetch.tinyfish.ai`)
* **Role:** Live Markdown and body extraction for exact quote validation.
* **Why it matters:** AI models can paraphrase; Source Hunter requires **verbatim proof**. TinyFish Fetch loads the live pages discovered in the trail with `ttl: 0` (no stale cache) and extracts clean Markdown text.
* **Implementation:** `fetchPages` in `backend/src/tracer.ts` requests up to 5 candidates simultaneously, extracting verbatim supporting sentences to compute sentence similarity and mathematical rounding.

---

## Summary of Points & Endpoints

| TinyFish Endpoint | URL | Purpose in Source Hunter |
| :--- | :--- | :--- |
| **TinyResearch** | `https://agent.tinyfish.ai/v1/automation/run-research` | **Core Requirement:** Autonomous deep citation trail exploration |
| **Search** | `https://api.search.tinyfish.ai` | Discovers candidate primary sources & alternative publications |
| **Fetch** | `https://api.fetch.tinyfish.ai` | Extracts live Markdown body to verify exact verbatim quotes |
