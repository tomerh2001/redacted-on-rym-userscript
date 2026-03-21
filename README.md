# RED + OPS on RYM

Violentmonkey userscript that adds compact RED and OPS status badges to Rate
Your Music album, EP, single, and artist pages, plus per-result reveal buttons
on charts pages, so you can see whether the matching release or artist is
already on either tracker without leaving RYM.

The current scope stays intentionally focused:

- RYM album release, EP release, single release, and artist pages
- RYM charts pages with manual per-result reveal buttons
- RED and OPS lookup through their documented browse and artist APIs
- automatic lookup on release and artist pages
- manual per-result lookup on charts pages only when you click reveal
- per-tracker request spacing to avoid bursty chart-page lookups
- badge placement directly below the Apple Music / Spotify / other streaming links row when present on release pages, with a heading fallback on artist or simpler pages

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/).
2. [Click here to install](https://github.com/tomerh2001/redacted-on-rym-userscript/releases/latest/download/redacted-on-rym.user.js).

3. Confirm the install prompt in Violentmonkey.
4. Open the Violentmonkey menu for the script and choose `Set RED API key`
   and/or `Set OPS API token`.
5. Paste the tracker credential you want to enable. The script can show both
   badges, or just one if you only configure one tracker.

For RED specifically, generate a dedicated API key with the minimum scope the
script needs. Release lookups use the browse endpoint, while artist-page
lookups use the artist endpoint, which RED's local API mirror places under
Torrent Scope.

## Why tracker API credentials

The local tracker docs explicitly point toward API-based access rather than
HTML scraping. This script follows that guidance and stores each tracker
credential only in Violentmonkey's isolated storage for the script.

For this lookup flow, the local RED and OPS API mirrors both show that torrent
search is available through the browse endpoint.

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
- `Show RED / OPS`
  On RYM charts pages, the script adds a reveal button for each supported result
  and only checks that single result after you click it.

## Development

```bash
npm install
npm test
npm run build
```

The built userscript is written to `dist/redacted-on-rym.user.js`.

## Releases

This repo now treats Conventional Commits as the release contract:

- `fix:` bumps the patch version
- `feat:` bumps the minor version
- `BREAKING CHANGE:` or `!` bumps the major version

On every push to `main`, GitHub Actions runs the CI checks first and then runs
`semantic-release`. The release job updates `package.json`, rebuilds
`dist/redacted-on-rym.user.js` through the `postversion` hook, creates the Git
tag/GitHub release, and commits the versioned files back to `main`
automatically. Manual version bumps should no longer be necessary for normal
feature or bugfix work.

The install and update URLs intentionally point at the latest GitHub release
asset instead of `raw.githubusercontent.com/main/...`, because the raw branch
CDN can lag behind the tagged release even after `main` has the newer build.

## Local Browser Fixture

Cloudflare blocks one-off Playwright access to live RYM from this environment,
so the repo now includes a local fixture page for browser-level verification.

```bash
npm run build
npm run fixture:serve
```

Then open:

`http://127.0.0.1:4173/release/album/james-blake/trying-times/`

or:

`http://127.0.0.1:4173/release/single/crocheted-doughnut-ring/two-little-ladies-azalea-and-rhododendron-nice/`

or:

`http://127.0.0.1:4173/artist/anna-zak/`

or:

`http://127.0.0.1:4173/charts/esoteric/album,ep,single/2020s/`

The fixtures preload mock RED and OPS credentials plus mocked tracker API
responses. The release fixture should render `RED on site` and `OPS not found`
directly below the media-links row on both album and single pages, while the
artist fixture should render the same states using the artist-page heading
fallback. The charts fixture should render `Show RED / OPS` buttons for each
result and only reveal the clicked row.
