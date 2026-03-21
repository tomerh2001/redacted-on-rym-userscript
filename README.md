# RED + OPS on RYM

Violentmonkey userscript that shows whether the current RYM release, artist, or
revealed chart result already has a match on RED or OPS.

Current behavior:

- Release pages: automatic chips on album, EP, and single pages
- Artist pages: automatic chips on artist pages
- Charts pages: per-result `Show RED / OPS` button instead of automatic lookups
- Trackers: RED and OPS only
- Lookups: documented tracker API endpoints only
- Rate protection: RED is capped at `10 requests / 10 seconds`, OPS at `5 requests / 10 seconds`, with built-in backoff after `429`

The charts behavior is intentionally manual so opening a chart page does not try
to look up every result and hammer RED or OPS.

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/).
2. [Click here to install](https://github.com/tomerh2001/redacted-on-rym-userscript/releases/latest/download/redacted-on-rym.user.js).

3. Confirm the install prompt in Violentmonkey.
4. Open the Violentmonkey menu for the script and choose `Set RED API key`
   and/or `Set OPS API token`.
5. Paste the tracker credential you want to enable. The script can show both
   badges, or just one if you only configure one tracker.

## Behavior

- On release and artist pages, the script looks up the current page
  automatically.
- On charts pages, each supported result gets its own `Show RED / OPS` button.
  Clicking that button only reveals that one result.
- When a release page has a streaming-links row, the chips appear below it.
  Otherwise they fall back near the main heading.
- `RED: on site` or `OPS: on site`
  The script found a likely exact group or artist match and links straight to it.
- `RED: not found` or `OPS: not found`
  The script did not find a likely exact release or artist match and links to
  the equivalent tracker search page so you can inspect manually.
- `RED: add key` or `OPS: add key`
  The script is installed but that tracker is not configured yet.
- `RED: lookup failed` or `OPS: lookup failed`
  The tracker returned an error, rate limit response, or auth failure.
- `Show RED / OPS`
  On RYM charts pages, the script adds a reveal button for each supported result
  and only checks that single result after you click it.

Current matching rules:

- Release matching uses the tracker browse API
- Artist matching uses the tracker artist API
- Supported release kinds are album, EP, and single
- Charts support is release-result only; it looks for RYM release links already
  present on the page and does not bulk-scan the whole chart automatically

## Development

```bash
npm install
npm test
npm run build
```

The built userscript is written to `dist/redacted-on-rym.user.js`.
