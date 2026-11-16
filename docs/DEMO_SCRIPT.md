# Source Hunter — Demo Script & Recording Checklist

This guide provides a reproducible testing script and evaluation protocol across **5 diverse real-world claims**, covering multiple domains and demonstrating all key verdicts (exact matches, rounded claims, altered context, and demonstrably incorrect assertions).

---

## Pre-Demo Checklist

- [ ] Backend server running at `http://localhost:3737` (`npm start` inside `backend/`).
- [ ] Backend health checked: `GET http://localhost:3737/health` returns HTTP 200 `{ ok: true }`.
- [ ] Chrome extension loaded in `chrome://extensions/` from `source-hunter/extension/dist`.
- [ ] Extension pinned to the toolbar.
- [ ] Sample article or reference tabs opened.

---

## Five claim cases

The backend smoke command runs the NOAA carbon dioxide case by default. Set `RUN_ALL=1` only when ready to start all five live traces. For the extension recording, open each reference and highlight the relevant text. For the NASA FAQ, highlight the disputed claim within the question.

| Case | Claim to trace | Reference and expected evidence |
| --- | --- | --- |
| Climate | Global atmospheric carbon dioxide reached 419.3 parts per million in 2023. | [NOAA release](https://www.noaa.gov/news-release/carbon-dioxide-levels-race-past-milestones-in-2023). Compare with the original [NOAA dataset](https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_gl.txt). |
| False claim | The Great Wall of China is the only human-made object visible from space. | [NASA Earth Observations FAQ](https://esrs.jsc.nasa.gov/FAQ/). Show NASA's explanation of unaided visibility from orbit. |
| Space history | Neil Armstrong was the first person to walk on the Moon in 1969. | [NASA's human spaceflight history](https://www.nasa.gov/specials/60counting/spaceflight.html). Look for primary Apollo mission records. |
| Displacement | Over 120 million people are forcibly displaced worldwide according to UNHCR. | The historical claim was traced from the [UNHCR overview](https://www.unhcr.org/about-unhcr/who-we-are/figures-at-a-glance) to [Global Trends 2023](https://www.unhcr.org/publications/global-trends-2023). Distinguish the early 2024 estimate from the year-end 2023 total. The live overview displays newer periods. |
| Monetary policy | In July 2023, the FOMC raised the federal funds target range to 5.25%–5.50%. | [July 26, 2023 FOMC statement](https://www.federalreserve.gov/newsevents/pressreleases/monetary20230726a.htm). Confirm the date and range in the original statement. |

Use `RUN_CASE` to choose one case from the runner. Set `RUN_RESEARCH_ID` to a completed run for exactly that claim to reuse its TinyResearch report and verify the cited pages again. The NOAA case can read the explicitly cited public plain-text dataset directly when TinyFish Fetch omits it.

Record the run ID, actual verdict, verified source links, and verbatim passages for each trace. The table lists planned checks.

## Recording sequence

1. Show the running backend and the installed extension.
2. Highlight a claim and use **Trace source with Source Hunter**. Show that the extension starts a live request.
3. Open the confirmed primary link and compare the quoted passage with the claim.
4. Show the actual result for the false claim, including the source that contradicts it if available.
5. Show the results for the remaining claims. State any unresolved outcomes directly.
