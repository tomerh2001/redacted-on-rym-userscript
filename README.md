# RED + OPS on RYM

Violentmonkey userscript that adds compact RED and OPS status badges to Rate
Your Music album release, single release, and artist pages so you can see
whether the matching release or artist is already on either tracker without
leaving RYM.

The current scope stays intentionally focused:

- RYM album release, single release, and artist pages
- RED and OPS lookup through their documented browse and artist APIs
- up to one request per configured tracker on each page view

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/).
2. [Click here to install](https://github.com/tomerh2001/redacted-on-rym-userscript/releases/latest/download/redacted-on-rym.user.js).

3. Confirm the install prompt in Violentmonkey.
4. Open the Violentmonkey menu for the script and choose `Set RED API key`
   and/or `Set OPS API token`.
5. Paste the tracker credential you want to enable. The script can show both
   badges, or just one if you only configure one tracker.

## Behavior

- `RED: on site` or `OPS: on site`
  The script found a likely exact group or artist match and links straight to it.
- `RED: not found` or `OPS: not found`
  The script did not find a likely exact release or artist match and links to
  the equivalent tracker search page so you can inspect manually.
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
