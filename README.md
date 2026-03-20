# RED + OPS on RYM

Violentmonkey userscript that adds compact RED and OPS status badges to Rate
Your Music album pages so you can see whether the release is already on either
tracker without leaving RYM.

The first version is intentionally narrow:

- RYM album pages only
- RED and OPS lookup through their documented browse APIs
- up to one request per configured tracker on each page view
- badge placement below RYM's existing streaming or integration links when
  that cluster is detectable, with a title-area fallback otherwise

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/).
2. [Click here to install](https://raw.githubusercontent.com/tomerh2001/redacted-on-rym-userscript/main/dist/redacted-on-rym.user.js).

3. Confirm the install prompt in Violentmonkey.
4. Open the Violentmonkey menu for the script and choose `Set RED API key`
   and/or `Set OPS API token`.
5. Paste the tracker credential you want to enable. The script can show both
   badges, or just one if you only configure one tracker.

## Why tracker API credentials

The local tracker docs explicitly point toward API-based access rather than
HTML scraping. This script follows that guidance and stores each tracker
credential only in Violentmonkey's isolated storage for the script.

For this lookup flow, the local RED and OPS API mirrors both show that torrent
search is available through the browse endpoint.

## Behavior

- `RED: on site` or `OPS: on site`
  The script found a likely group match and links straight to it.
- `RED: not found` or `OPS: not found`
  The script did not find a likely exact match and links to the equivalent
  tracker search page so you can inspect manually.
- `RED: add key` or `OPS: add key`
  The script is installed but that tracker is not configured yet.
- `RED: lookup failed` or `OPS: lookup failed`
  The tracker returned an error, rate limit response, or auth failure.

## Development

```bash
npm install
npm test
npm run build
```

The built userscript is written to `dist/redacted-on-rym.user.js`.
