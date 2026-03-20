# Research Journal: RED on RYM initial architecture

- Date: 2026-03-20
- Status: active
- Canonical journal file path: `research/2026/March/20/RED on RYM initial architecture.md`
- Scope: first-pass architecture for a userscript that marks RYM album pages as already present or absent on RED

## Direct answer

The safest first version is a RYM album-page userscript that queries RED's
documented browse API with a user-supplied API key and injects a compact status
badge next to RYM's existing streaming or integration links when that cluster
is detectable.

## Confirmed points

1. RED's local docs say automated access should use the API rather than HTML
   scraping.
   - Source: `../projects/tomerh2001/trackers/red/research/research-journal-red-request-search-automation.md`
   - Backing local docs:
     - `../projects/tomerh2001/trackers/red/pages/00-core/rules-index-reference.md`
     - `../projects/tomerh2001/trackers/red/pages/60-api-tools/redacted-api-reference.md`

2. RED's browse API supports the fields needed for a narrow album lookup:
   `searchstr`, `artistname`, `groupname`, `year`, and `releasetype`.
   - Source: `../projects/tomerh2001/trackers/red/pages/60-api-tools/redacted-api-reference.md`

3. RED's API reference lists torrent search under the "No Scope Required"
   section, so a minimal-purpose API key is a better default than trying to use
   a session cookie from a third-party page.
   - Source: `../projects/tomerh2001/trackers/red/pages/60-api-tools/redacted-api-reference.md`

4. Existing local RED userscript guidance says the safe pattern is
   user-initiated and page-local. One request for the page the user is already
   viewing fits that pattern better than any background crawl or broad sync.
   - Source: `../projects/tomerh2001/trackers/red/research/research-journal-red-sandbox-userscript-posting-guidance.md`

5. Public RYM DOM inspection from this environment was blocked by Cloudflare's
   "Performing security verification" page in Playwright on 2026-03-20 UTC, so
   hardcoding selectors from live inspection was not practical for this run.
   - Source: one-off Playwright attempt against
     `https://rateyourmusic.com/release/album/james-blake/trying-times/`

## Decision

- Scope v1 to RYM album pages only.
- Require the user to set a RED API key in Violentmonkey before the script
  makes any RED request.
- Query RED through `ajax.php?action=browse` with `artistname`, `groupname`,
  and album `releasetype`.
- Match locally using normalized artist and title keys so the script stays
  conservative about claiming a hit.
- Insert the badge into the existing streaming-links cluster when detectable,
  otherwise fall back to the title area.

## Risks

- RYM DOM heuristics may miss the streaming-links cluster on some themes or
  future markup revisions.
- Exact-ish matching may miss releases with materially different RED group
  titles, translations, or unusual artist-credit shapes.
- Live RED verification still needs an explicit tracker-safety notice before
  this workspace touches RED directly.

## Actions taken

- Created a new standalone userscript project scaffold.
- Implemented the first-pass lookup flow and test coverage around metadata
  parsing and RED-result matching.
- Deferred live RED verification to a separate, explicitly-noticed step.
