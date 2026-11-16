# Source Hunter specification

Source: `D:\tinyfish-details.md`, bounty 1 and its rulebook.

Chrome or Firefox extension that starts a trace from highlighted text in one action and shows where the claim changed.

## TinyFish products

**Required: TinyResearch** for cited live tracing. Search, Fetch, and Agent are optional supporting endpoints when they add evidence.

## Official submission requirements

- **S1** A working browser extension (Chrome or Firefox): highlight text on any page to start a trace
- **S2** Follows citations across live pages back to the earliest source it can find
- **S3** Shows the chain of sources (each with link, date and exact wording) and whether the claim matches the original
- **S4** Flags when a claim was changed, rounded, misquoted or has no traceable source
- **S5** Demo on at least five real claims, including at least one that turns out to be wrong
- **S6** Uses TinyResearch, with a short explanation of how it is used (Search, Fetch and Agent can help around it)

## Official approval criteria

- **A1** Every step is a real, live source with a link and its exact wording
- **A2** Reaches a primary source where one exists, not just the most popular copy
- **A3** Honest: "no original source found" when that's the answer
- **A4** Works on claims across different sites and topics, not a hardcoded few
- **A5** Fast and clear enough to use while reading

## Official judging priorities

- **J1** Depth: how far back the trail goes, ideally to the primary source
- **J2** Accuracy: every step's link and exact wording are correct
- **J3** Judgement: spots when a claim was changed, rounded or misquoted
- **J4** Experience: the extension is quick and clear to use while reading
- **J5** Honesty: says when no original source can be found

## Demo and acceptance tests

Trace at least five real claims across different sites and topics, including at least one incorrect claim. Include a reachable primary source and an unresolved trail in the test set.

- **A1** Build a trace view with a live link, publication date, and exact verified wording for each step. Test a quote in a report and a duplicate copy. Show unknown when a date cannot be verified.
- **A2** Follow citations backward and distinguish a documented citation from a merely similar claim. Test a chain with a study or filing and show the primary source and whether the claim matches.
- **A3** Classify changes, rounding, and misquotation using source wording, units, and context. Test circular citations and unavailable origins. Show 'no original source found' when the trail cannot establish one.
- **A4** Support new selections from different sites and topics. Run the required five-claim demo including an incorrect claim.
- **A5** Add the one-action selection entry point and clear progress, completion, and partial-result states. Test an ordinary reading session and a slow upstream response.

## Edge cases and security

Treat page text as untrusted. Limit extension permissions and send only the selected excerpt and necessary source context. Keep TinyFish credentials out of the extension bundle. Test empty selections, blocked browser pages, redirects, paywalls, missing dates, and provider timeouts.

Keep credentials, access tokens, and other people's personal data out of the build and demo. Use sanitized fixtures for failure tests and label fixture evidence separately from live evidence.

## Rulebook and submission deadline

- Deadline: Tuesday, November 17, 2026 at 11:59 PM Pacific (Wednesday, November 18 at 12:59 PM Pakistan time).
- Enter through the TinyFish Students or Ambassadors program. One person per build and one entry per person per bounty. Claims do not reserve a bounty, and submissions are final.
- Provide a working build link (repo, live demo, or cookbook PR) with notes on what it does and how TinyFish is used. Post about the build on LinkedIn and tag TinyFish. Share it in Discord #showcase. X is optional.
- Pass every approval criterion. Use original work built for the bounty and demonstrate meaningful live TinyFish work end to end across varied inputs. Keep the submitted evidence authentic.
- The launch-exclusive listing advertises 400 winner points and 100 for other valid entries. The general rulebook separately gives 50/100/150/200 points for 1/2/3/4+ meaningful endpoints and describes top-three approvals. It names Search, Fetch, Agent, Browser, and Monitor, without stating how the required launch product counts. Confirm how these rules interact before relying on a points or approval estimate.

## Open questions and dependencies

The brief gives no timing target or fallback policy for undated sources. Check TinyResearch integration access and browser distribution requirements early.
