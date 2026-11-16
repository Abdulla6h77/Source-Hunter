# Source Hunter — Citation Trail & Verification Engine

> **Bounty 1 Entry:** A Chrome Manifest V3 extension and backend that traces claims, statistics, and quotations across live web sources to uncover their earliest verifiable primary origin, displaying citation chains and highlighting altered, rounded, or misattributed statements.

---

## Architecture Overview

Source Hunter adheres to a strict separation of concerns to safeguard credentials and provide seamless user experience:

```
┌─────────────────────────────────────────────────────────────┐
│                       Web Browser                           │
│  [ Webpage Selection ] ──> [ Context Menu / Content Script ]│
│                                      │                      │
│                                      ▼                      │
│  [ Visual Popup UI ] <──── [ Chrome Background Worker ]      │
└──────────────────────────────────────┬──────────────────────┘
                                       │ HTTP POST /trace
                                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Secure Local / Edge Backend               │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 Trace Engine (tracer.ts)            │   │
│   │  • Input Validation & Safety Policy                 │   │
│   │  • Similarity Scoring & Rounding Classifier         │   │
│   │  • Citation Graph Builder                           │   │
│   └───────────────┬─────────────────┬───────────────────┘   │
│                   │                 │                       │
│                   ▼                 ▼                       │
│        TinyResearch (Deep Mode)  TinyFish Search & Fetch    │
│        [ Primary Origin Tracer ] [ Corroboration Engine ]   │
└───────────────────┬─────────────────┬───────────────────────┘
                    │                 │
                    ▼                 ▼
          Live Web Intelligence (TinyFish API Ecosystem)
```

1. **Chrome Extension (MV3, TypeScript):**
   - Context-menu trigger (`Trace source with Source Hunter`) and active-tab selection listener.
   - Elegant dark-mode visual popup interface rendering progressive status updates, citation step cards, publication dates, verbatim supporting excerpts, and verdict banners.
   - Built without embedded secrets. Communicates exclusively with the local backend over secured loopback.

2. **Secure Node.js / TypeScript Backend:**
   - Holds `TINYFISH_API_KEY` exclusively server-side.
   - Exposes `/trace` and `/health` with strict Zod validation, protocol verification, and sanitization.
   - Orchestrates multi-endpoint queries using **TinyFish TinyResearch** as the primary research driver, supplemented by **TinyFish Search** and **TinyFish Fetch** for corroboration and verbatim text confirmation.

3. **Heuristic & Verification Engine:**
   - Detects when numbers are rounded (e.g. `3.14 million` $\to$ `over 3 million`).
   - Identifies word alterations, misquotes, and circular citation loops.
   - Issues an honest, explicit `No original source found` when evidence is missing or unreliable.

---

## Directory Structure

```
source-hunter/
├── extension/                     # Chrome Manifest V3 Extension
│   ├── manifest.json              # Extension manifest (MV3)
│   ├── popup.html                 # Main popup UI
│   ├── popup.css                  # Modern UI styles
│   ├── src/
│   │   ├── background.ts          # Service worker & message router
│   │   ├── content.ts             # Selection listener
│   │   ├── popup.ts               # UI controller & renderer
│   │   └── types.ts               # Extension contracts
│   ├── dist/                      # Compiled JS & assets ready to load
│   └── scripts/
│       ├── generate-icons.mjs     # Procedural PNG icon generator
│       └── copy-assets.mjs        # Asset bundling script
├── backend/                       # Node.js backend
│   ├── src/
│   │   ├── server.ts              # Express API server
│   │   ├── tracer.ts              # Citation tracing & classification
│   │   ├── tinyfish.ts            # TinyFish API client (Research/Search/Fetch)
│   │   └── types.ts               # Shared models
│   ├── dist/                      # Compiled backend JavaScript
│   ├── tests/
│   │   ├── tracer.test.ts         # 18 unit tests
│   │   └── live.test.ts           # Live end-to-end integration test
│   ├── .env.example               # Configuration example
│   └── package.json
├── docs/                          # Demo scripts & acceptance evidence
│   ├── DEMO_SCRIPT.md             # 5 demonstration cases & step-by-step checklist
│   └── SECURITY_AND_LIMITS.md     # Security architecture & boundaries
├── SPEC.md                        # Requirements record
├── TASKS.md                       # Milestone checklist
└── README.md                      # Project documentation
```

---

## Quickstart & Installation Guide

### Prerequisites
- Node.js v20+ (tested on Node v24)
- Google Chrome or Chromium-based browser
- TinyFish API Key

### 1. Configure and Run Backend
```bash
cd backend
npm install
cp .env.example .env
# Ensure TINYFISH_API_KEY is configured in backend/.env
npm run build
npm start
```
The server will boot on `http://localhost:3737`. Verify health via:
```bash
curl http://localhost:3737/health
```

### 2. Build and Load Chrome Extension
```bash
cd ../extension
npm install
npm run build
```
To load the extension into Chrome:
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `source-hunter/extension/dist` directory.
5. The **Source Hunter** icon will appear in your Chrome toolbar. Pin it for easy access.

---

## Running Automated Tests

Run backend unit tests (covers word similarity, rounding detection, date parsing, input validation, and verdict derivation):
```bash
cd backend
npm test
```
The suite uses local fixtures and includes checks for missing fetched evidence and the order of primary-source verification.

To run one live smoke case with your configured TinyFish key:
```bash
cd backend
npm run test:live
```

The smoke test checks one claim by default. See the [five live backend results](docs/LIVE_RESULTS.md) and the [Chrome demo guide](docs/DEMO_SCRIPT.md).

The popup can close and reopen while a trace runs. The backend holds in-progress jobs in memory, so keep it running until the report is ready. Completed jobs are available for up to 12 hours while that backend is running.
