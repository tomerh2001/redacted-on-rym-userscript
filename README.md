# RED on RYM

Violentmonkey userscript that adds a compact RED status badge to Rate Your Music
album pages so you can see whether the release is already on RED without
leaving RYM.

The first version is intentionally narrow:

- RYM album pages only
- RED lookup through the documented browse API
- one request per page view, only after you add your own RED API key
- badge placement next to RYM's existing streaming or integration links when
  that cluster is detectable, with a title-area fallback otherwise

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/).
2. Open the raw userscript URL:

   `https://raw.githubusercontent.com/tomerh2001/redacted-on-rym-userscript/main/dist/redacted-on-rym.user.js`

3. Confirm the install prompt in Violentmonkey.
4. Open the Violentmonkey menu for the script and choose `Set RED API key`.
5. Paste a RED API key that is limited to the minimum access you are
   comfortable with.

## Why an API key

RED's local docs explicitly say automated access should use the API rather than
scraping HTML. This script follows that guidance and stores the API key only in
Violentmonkey's isolated storage for the script.

For this lookup flow, the local RED API mirror shows that torrent search is
available through the browse endpoint and does not require extra API scopes.

## Behavior

- `RED: on site`
  The script found a likely group match and links straight to it.
- `RED: not found`
  The script did not find a likely exact match and links to the equivalent RED
  search page so you can inspect manually.
- `RED: add API key`
  The script is installed but cannot query RED yet.
- `RED: lookup failed`
  RED returned an error, rate limit response, or auth failure.

## Development

```bash
npm install
npm test
npm run build
```

The built userscript is written to `dist/redacted-on-rym.user.js`.
