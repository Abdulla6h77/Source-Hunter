# Evidence assessment fixes

Verified offline, not new live evidence:

- Prefer relevant fetched publisher landing-page evidence linking the designated original over unrelated PDF excerpts.
- Partial numerical coverage gets partial-support. Word overlap does not prove truth; unrelated wording does not prove misquotation; nearby values do not prove rounding.
- Related evidence is distinguished from explicit verified citation links.
- Dates fall back to citation metadata or explicit full calendar dates in fetched titles. Report years alone remain unknown.
- Client timeouts preserve accumulated research and run identifiers while retaining partial status. Provider timeouts can still happen.
- Regression checks cover the UNHCR multi-clause selection, unrelated PDF selection, opposite wording, irrelevant excerpts and invalid dates.

Saved live artifacts retain their original verdicts and timestamps. Restart the backend and reload the extension. Fresh installed-extension and live provider checks remain outstanding. No new paid calls were made.
