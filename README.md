# RED + OPS on RYM

Violentmonkey userscript that shows whether the current Rate Your Music
release, artist, or revealed chart result already has a match on RED or OPS.

The script is intentionally narrow:

- it runs on `rateyourmusic.com/release/*`, `rateyourmusic.com/artist/*`, and
  `rateyourmusic.com/charts/*`
- it looks up release pages and artist pages automatically
- it keeps chart lookups manual with a per-result `Show RED / OPS` button
- it only supports RED and OPS
- it uses documented tracker API endpoints only
- it rate-limits itself to RED `10 requests / 10 seconds` and OPS
  `5 requests / 10 seconds`, with built-in backoff after `429`
- it caches successful lookup results locally so repeat visits do not keep
  spending tracker requests

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/).
2. Click the install button:

   [![Install in Violentmonkey](https://img.shields.io/badge/Install%20in-Violentmonkey-F7DF1E?style=for-the-badge&logo=github&logoColor=black)](https://github.com/tomerh2001/redacted-on-rym-userscript/releases/latest/download/redacted-on-rym.user.js)

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
  The script found a likely exact group or artist match and links straight to
  it.
- `RED: not found` or `OPS: not found`
  The script did not find a likely exact release or artist match and links to
  the equivalent tracker search page so you can inspect manually.
- `RED: add key` or `OPS: add key`
  The script is installed but that tracker is not configured yet.
- `RED: lookup failed` or `OPS: lookup failed`
  The tracker returned an error, rate limit response, or auth failure.
- Supported release kinds are album, EP, and single.
- Charts support is release-result only; it looks for RYM release links already
  present on the page and does not bulk-scan the whole chart automatically.

## Development

```bash
npm install
npm test
npm run build
```

The built userscript is written to `dist/redacted-on-rym.user.js`.

## Local Fixture

RYM blocks one-off automated access from this environment, so the repo includes
offline fixtures that mirror the supported release, artist, and chart page
shapes used by the live site.

```bash
npm run build
npm run fixture:serve
```

Then open one of:

`http://127.0.0.1:4173/release/album/james-blake/trying-times/`

`http://127.0.0.1:4173/artist/anna-zak/`

`http://127.0.0.1:4173/charts/esoteric/album,ep,single/2020s/`

## Releases

This repo follows a conventional release contract:

- `fix:` bumps the patch version
- `feat:` bumps the minor version
- `BREAKING CHANGE:` or `!` bumps the major version

On every push to `main`, GitHub Actions runs the CI checks first and then runs
`semantic-release`. The release job updates `package.json`, rebuilds
`dist/redacted-on-rym.user.js` through the `postversion` hook, creates the Git
tag and GitHub release, and commits the versioned files back to `main`
automatically.

The install and update URLs intentionally point at the latest GitHub release
asset instead of `raw.githubusercontent.com/main/...`, so installs track the
published release artifact rather than the moving branch tip.
