# Research Journal: RED on RYM initial architecture

- Date: 2026-03-20
- Status: active
- Canonical journal file path: `research/2026/March/20/RED on RYM initial architecture.md`
- Scope: first-pass architecture for a userscript that marks RYM album pages as already present or absent on RED and OPS

## Direct answer

The safest first version is a RYM album-page userscript that queries RED's and
OPS's documented browse APIs with user-supplied credentials and injects compact
status badges below RYM's existing streaming or integration links when that
cluster is detectable.

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

4. OPS's local API mirror documents the same browse-style torrent search shape:
   `ajax.php?action=browse&searchstr=<Search Term>` with `artistname`,
   `groupname`, `year`, and `releasetype`.
   - Source: `../projects/tomerh2001/trackers/ops/pages/60-api-tools/orpheus-api-reference.md`

5. OPS's local API mirror prefers `Authorization: token ${api_token}` for API
   token auth, while still noting bare tokens only as a deprecated
   interoperability form.
   - Source: `../projects/tomerh2001/trackers/ops/pages/60-api-tools/orpheus-api-reference.md`

6. Existing local RED userscript guidance says the safe pattern is
   user-initiated and page-local. One request for the page the user is already
   viewing fits that pattern better than any background crawl or broad sync.
   - Source: `../projects/tomerh2001/trackers/red/research/research-journal-red-sandbox-userscript-posting-guidance.md`

7. Public RYM DOM inspection from this environment was blocked by Cloudflare's
   "Performing security verification" page in Playwright on 2026-03-20 UTC, so
   hardcoding selectors from live inspection was not practical for this run.
   - Source: one-off Playwright attempt against
     `https://rateyourmusic.com/release/album/james-blake/trying-times/`

## Decision

- Scope v1 to RYM album pages only.
- Require the user to set tracker credentials in Violentmonkey before the
  script makes any tracker request.
- Query RED and OPS through `ajax.php?action=browse` with `artistname`,
  `groupname`, and album `releasetype`.
- Format the OPS auth header as `Authorization: token ${api_token}` to match
  the tracker documentation.
- Match locally using normalized artist and title keys so the script stays
  conservative about claiming a hit.
- Prefer RYM's `#media_link_button_container_top` as the badge anchor and
  insert the badges as a separate row below it; otherwise fall back to a
  streaming-links heuristic and then the title area.

## Risks

- RYM may still revise the media-links markup, so the explicit
  `#media_link_button_container_top` anchor could require a future selector
  update.
- Exact-ish matching may miss releases with materially different tracker group
  titles, translations, or unusual artist-credit shapes.
- Live tracker verification still needs an explicit tracker-safety notice
  before this workspace touches RED or OPS directly.

## Actions taken

- Created a new standalone userscript project scaffold.
- Implemented the first-pass multi-tracker lookup flow and test coverage around
  metadata parsing and tracker-result matching.
- Deferred live RED and OPS verification to separate, explicitly-noticed steps.
