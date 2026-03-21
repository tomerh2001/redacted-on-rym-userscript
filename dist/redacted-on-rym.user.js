// ==UserScript==
// @name         RED + OPS on RYM
// @namespace    https://github.com/tomerh2001/redacted-on-rym-userscript
// @version      1.1.1
// @description  Show whether the current Rate Your Music album, EP, single, artist, or revealed chart result already exists on RED or OPS.
// @author       Tomer Horowitz
// @match        https://rateyourmusic.com/release/album/*
// @match        https://rateyourmusic.com/release/ep/*
// @match        https://rateyourmusic.com/release/single/*
// @match        https://rateyourmusic.com/artist/*
// @match        https://rateyourmusic.com/charts/*
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      redacted.sh
// @connect      orpheus.network
// @run-at       document-idle
// @homepageURL  https://github.com/tomerh2001/redacted-on-rym-userscript
// @supportURL   https://github.com/tomerh2001/redacted-on-rym-userscript/issues
// @downloadURL  https://github.com/tomerh2001/redacted-on-rym-userscript/releases/latest/download/redacted-on-rym.user.js
// @updateURL    https://github.com/tomerh2001/redacted-on-rym-userscript/releases/latest/download/redacted-on-rym.user.js
// ==/UserScript==
(() => {
  // src/rym.js
  var RELEASE_PATH_RE = /^\/release\/([^/]+)\/([^/]+)\/([^/]+)\/?$/i;
  var ARTIST_PATH_RE = /^\/artist\/([^/]+)\/?$/i;
  var STREAMING_HOST_SUFFIXES = [
    "spotify.com",
    "apple.com",
    "tidal.com",
    "deezer.com",
    "bandcamp.com",
    "soundcloud.com",
    "youtube.com"
  ];
  function normalizeWhitespace(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }
  function toDisplayText(value) {
    if (!value) {
      return null;
    }
    return value.split(" ").map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part).join(" ");
  }
  function stripRymTitleSuffix(rawTitle) {
    return normalizeWhitespace(
      String(rawTitle ?? "").replace(/\s+-\s+Rate Your Music.*$/i, "").replace(/\s+-\s+RYM.*$/i, "")
    );
  }
  function readPageTitle(doc = document) {
    return doc.querySelector('meta[property="og:title"]')?.content ?? doc.querySelector('meta[name="twitter:title"]')?.content ?? doc.title ?? "";
  }
  function readPageDescription(doc = document) {
    return doc.querySelector('meta[property="og:description"]')?.content ?? doc.querySelector('meta[name="description"]')?.content ?? "";
  }
  function readHeadingText(doc = document) {
    return normalizeWhitespace(doc.querySelector("h1")?.textContent ?? "");
  }
  function isSupportedReleaseKind(releaseKind) {
    return releaseKind === "album" || releaseKind === "ep" || releaseKind === "single";
  }
  function decodeRymSlug(slug) {
    if (typeof slug !== "string" || !slug.trim()) {
      return null;
    }
    try {
      const decoded = decodeURIComponent(slug);
      return toDisplayText(normalizeWhitespace(decoded.replace(/\+/g, " ").replace(/[-_]+/g, " ")));
    } catch {
      return toDisplayText(normalizeWhitespace(slug.replace(/\+/g, " ").replace(/[-_]+/g, " ")));
    }
  }
  function parseReleasePath(pathname) {
    const match = RELEASE_PATH_RE.exec(pathname ?? "");
    if (!match) {
      return null;
    }
    const releaseKind = match[1].toLowerCase();
    return {
      releaseKind,
      artistSlug: match[2],
      titleSlug: match[3],
      artistGuess: decodeRymSlug(match[2]),
      titleGuess: decodeRymSlug(match[3])
    };
  }
  function parseReleaseTitle(rawTitle) {
    const cleaned = stripRymTitleSuffix(rawTitle);
    if (!cleaned) {
      return null;
    }
    const match = cleaned.match(/^(.*?)\s+by\s+(.+?)(?:\s+\(|\s+-|$)/i);
    if (!match) {
      return null;
    }
    return {
      title: normalizeWhitespace(match[1]),
      artist: normalizeWhitespace(match[2])
    };
  }
  function parseArtistPath(pathname) {
    const match = ARTIST_PATH_RE.exec(pathname ?? "");
    if (!match) {
      return null;
    }
    return {
      artistSlug: match[1],
      artistGuess: decodeRymSlug(match[1])
    };
  }
  function parseArtistTitle(rawTitle) {
    const cleaned = stripRymTitleSuffix(rawTitle);
    if (!cleaned) {
      return null;
    }
    const patterns = [
      /^(.*?)\s+Albums?:\s+/i,
      /^(.*?)\s+Discography:\s+/i,
      /^(.*?)\s+Songs:\s+/i,
      /^(.*?)\s+Music profile\b/i
    ];
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        return normalizeWhitespace(match[1]);
      }
    }
    return null;
  }
  function findLikelyReleaseYear(text) {
    if (typeof text !== "string" || !text.trim()) {
      return null;
    }
    const releasedMatch = text.match(/\breleased?\b[\s,:-]*(?:\d{1,2}\s+\p{L}+\s+)?(19\d{2}|20\d{2})/iu);
    if (!releasedMatch) {
      return null;
    }
    return Number(releasedMatch[1]);
  }
  function normalizeMatchKey(value) {
    return normalizeWhitespace(String(value ?? "")).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[&+]/g, " and ").replace(/['’`´]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").toLowerCase().trim();
  }
  function isSupportedIntegrationHref(href) {
    try {
      const url = new URL(href, "https://rateyourmusic.com");
      const hostname = url.hostname.toLowerCase();
      return STREAMING_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
    } catch {
      return false;
    }
  }
  function countServiceLinks(container, serviceLinks) {
    return serviceLinks.filter((link) => container.contains(link)).length;
  }
  function collectCandidateContainers(link) {
    const candidates = [];
    let current = link.parentElement;
    let depth = 0;
    const stopAt = link.ownerDocument?.body ?? null;
    while (current && current !== stopAt && depth < 6) {
      candidates.push({ element: current, depth });
      current = current.parentElement;
      depth += 1;
    }
    return candidates;
  }
  function findIntegrationContainer(doc = document) {
    const serviceLinks = [...doc.querySelectorAll("a[href]")].filter((link) => isSupportedIntegrationHref(link.href));
    if (serviceLinks.length < 2) {
      return null;
    }
    const candidates = serviceLinks.flatMap((link) => collectCandidateContainers(link));
    const scoredCandidates = candidates.map((candidate) => {
      const serviceLinkCount = countServiceLinks(candidate.element, serviceLinks);
      const allLinkCount = candidate.element.querySelectorAll("a[href]").length;
      const descendantCount = candidate.element.querySelectorAll("*").length;
      return {
        ...candidate,
        serviceLinkCount,
        allLinkCount,
        descendantCount
      };
    }).filter((candidate) => candidate.serviceLinkCount >= 2 && candidate.allLinkCount <= 12 && candidate.descendantCount <= 80).sort((left, right) => left.allLinkCount - right.allLinkCount || left.descendantCount - right.descendantCount || right.serviceLinkCount - left.serviceLinkCount || left.depth - right.depth);
    return scoredCandidates[0]?.element ?? null;
  }
  function findBadgeMount(doc = document) {
    const integrationContainer = findIntegrationContainer(doc);
    if (integrationContainer) {
      return {
        mode: "integration",
        container: integrationContainer,
        preferred: true
      };
    }
    const heading = doc.querySelector("h1");
    if (heading) {
      return {
        mode: "heading",
        container: heading,
        preferred: true
      };
    }
    return {
      mode: "body",
      container: doc.body,
      preferred: false
    };
  }
  function extractReleaseMetadata(doc = document, locationObject = window.location) {
    const pathInfo = parseReleasePath(locationObject?.pathname ?? "");
    if (!pathInfo || !isSupportedReleaseKind(pathInfo.releaseKind)) {
      return null;
    }
    const titleMeta = readPageTitle(doc);
    const descriptionMeta = readPageDescription(doc);
    const parsedTitle = parseReleaseTitle(titleMeta);
    return {
      pageKind: "release",
      releaseKind: pathInfo.releaseKind,
      artist: parsedTitle?.artist ?? pathInfo.artistGuess,
      title: parsedTitle?.title ?? pathInfo.titleGuess,
      year: findLikelyReleaseYear(descriptionMeta)
    };
  }
  function extractArtistMetadata(doc = document, locationObject = window.location) {
    const pathInfo = parseArtistPath(locationObject?.pathname ?? "");
    if (!pathInfo) {
      return null;
    }
    const artist = parseArtistTitle(readPageTitle(doc)) ?? readHeadingText(doc) ?? pathInfo.artistGuess;
    if (!artist) {
      return null;
    }
    return {
      pageKind: "artist",
      artist
    };
  }
  function extractRymPageMetadata(doc = document, locationObject = window.location) {
    return extractReleaseMetadata(doc, locationObject) ?? extractArtistMetadata(doc, locationObject);
  }

  // src/charts.js
  var CHARTS_PATH_RE = /^\/charts\//i;
  function getAnchorHref(anchor) {
    if (typeof anchor?.getAttribute === "function") {
      const attributeHref = anchor.getAttribute("href");
      if (attributeHref) {
        return attributeHref;
      }
    }
    return anchor?.href ?? "";
  }
  function scoreChartAnchor(anchor) {
    let score = 0;
    const text = normalizeWhitespace(anchor?.textContent ?? "");
    if (text) {
      score += 10;
    }
    const parentTagName = String(anchor?.parentElement?.tagName ?? "").toUpperCase();
    if (/^H[1-6]$/.test(parentTagName)) {
      score += 20;
    }
    const classNames = [
      anchor?.className,
      anchor?.parentElement?.className
    ].filter((value) => typeof value === "string").join(" ");
    if (/\b(title|release|chart|name)\b/i.test(classNames)) {
      score += 5;
    }
    return score;
  }
  function buildChartEntry(anchor) {
    try {
      const href = getAnchorHref(anchor);
      const url = new URL(href, "https://rateyourmusic.com");
      const pathInfo = parseReleasePath(url.pathname);
      if (!pathInfo || !isSupportedReleaseKind(pathInfo.releaseKind)) {
        return null;
      }
      return {
        key: url.pathname,
        href: url.toString(),
        anchor,
        score: scoreChartAnchor(anchor),
        metadata: {
          pageKind: "release",
          releaseKind: pathInfo.releaseKind,
          artist: pathInfo.artistGuess,
          title: normalizeWhitespace(anchor?.textContent ?? "") || pathInfo.titleGuess,
          year: null
        }
      };
    } catch {
      return null;
    }
  }
  function isChartsPath(pathname) {
    return CHARTS_PATH_RE.test(pathname ?? "");
  }
  function extractChartEntries(doc = document, locationObject = window.location) {
    if (!isChartsPath(locationObject?.pathname ?? "")) {
      return [];
    }
    const bestEntriesByKey = /* @__PURE__ */ new Map();
    for (const anchor of [...doc.querySelectorAll("a[href]")]) {
      const entry = buildChartEntry(anchor);
      if (!entry?.metadata?.artist || !entry.metadata.title) {
        continue;
      }
      const existing = bestEntriesByKey.get(entry.key);
      if (!existing || entry.score > existing.score) {
        bestEntriesByKey.set(entry.key, entry);
      }
    }
    return [...bestEntriesByKey.values()].map(({ score, ...entry }) => entry);
  }

  // src/trackers.js
  var RELEASE_TYPE_IDS = {
    album: "1",
    ep: "5",
    single: "9"
  };
  var TRACKERS = [
    {
      id: "red",
      label: "RED",
      browseEndpoint: "https://redacted.sh/ajax.php?action=browse",
      artistEndpoint: "https://redacted.sh/ajax.php?action=artist",
      searchPage: "https://redacted.sh/torrents.php",
      groupPage: "https://redacted.sh/torrents.php",
      artistPage: "https://redacted.sh/artist.php",
      credentialStorageKey: "redApiKey",
      credentialMenuLabel: "RED API key",
      buildAuthorizationHeader(credential) {
        return credential;
      }
    },
    {
      id: "ops",
      label: "OPS",
      browseEndpoint: "https://orpheus.network/ajax.php?action=browse",
      artistEndpoint: "https://orpheus.network/ajax.php?action=artist",
      searchPage: "https://orpheus.network/torrents.php",
      groupPage: "https://orpheus.network/torrents.php",
      artistPage: "https://orpheus.network/artist.php",
      credentialStorageKey: "opsApiToken",
      credentialMenuLabel: "OPS API token",
      buildAuthorizationHeader(credential) {
        return credential.toLowerCase().startsWith("token ") ? credential : `token ${credential}`;
      }
    }
  ];
  function artistKeysMatch(leftValue, rightValue) {
    const leftKey = normalizeMatchKey(leftValue);
    const rightKey = normalizeMatchKey(rightValue);
    if (!leftKey || !rightKey) {
      return false;
    }
    return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey);
  }
  function buildBrowseUrl(tracker, metadata) {
    const url = new URL(tracker.browseEndpoint);
    url.searchParams.set("searchstr", `${metadata.artist} ${metadata.title}`.trim());
    url.searchParams.set("artistname", metadata.artist);
    url.searchParams.set("groupname", metadata.title);
    url.searchParams.set("page", "1");
    const releaseType = RELEASE_TYPE_IDS[metadata.releaseKind];
    if (releaseType) {
      url.searchParams.set("releasetype", releaseType);
    }
    if (metadata.year) {
      url.searchParams.set("year", String(metadata.year));
    }
    return url.toString();
  }
  function buildArtistLookupUrl(tracker, metadata) {
    const url = new URL(tracker.artistEndpoint);
    url.searchParams.set("artistname", metadata.artist);
    url.searchParams.set("artistreleases", "1");
    return url.toString();
  }
  function buildSearchPageUrl(tracker, metadata) {
    const url = new URL(tracker.searchPage);
    url.searchParams.set("artistname", metadata.artist);
    if (metadata.pageKind === "artist") {
      url.searchParams.set("searchstr", metadata.artist);
      return url.toString();
    }
    url.searchParams.set("searchstr", `${metadata.artist} ${metadata.title}`.trim());
    url.searchParams.set("groupname", metadata.title);
    const releaseType = RELEASE_TYPE_IDS[metadata.releaseKind];
    if (releaseType) {
      url.searchParams.set("releasetype", releaseType);
    }
    return url.toString();
  }
  function buildGroupUrl(tracker, groupId) {
    const url = new URL(tracker.groupPage);
    url.searchParams.set("id", String(groupId));
    return url.toString();
  }
  function buildArtistPageUrl(tracker, artistName, artistId) {
    const url = new URL(tracker.artistPage);
    if (artistId) {
      url.searchParams.set("id", String(artistId));
    } else {
      url.searchParams.set("artistname", artistName);
    }
    return url.toString();
  }
  function formatCount(count, singular, plural = `${singular}s`) {
    if (!Number.isFinite(count) || count <= 0) {
      return null;
    }
    return `${count} ${count === 1 ? singular : plural}.`;
  }
  function isLikelyMissingArtistError(error) {
    if (!(error instanceof Error)) {
      return false;
    }
    return /responded with 404|responded with 400|unsuccessful API response/i.test(error.message);
  }
  function scoreGroupMatch(group, metadata) {
    const groupTitleKey = normalizeMatchKey(group?.groupName);
    const metadataTitleKey = normalizeMatchKey(metadata?.title);
    if (!groupTitleKey || !metadataTitleKey) {
      return -1;
    }
    let score = 0;
    if (groupTitleKey === metadataTitleKey) {
      score += 60;
    } else if (groupTitleKey.includes(metadataTitleKey) || metadataTitleKey.includes(groupTitleKey)) {
      score += 30;
    } else {
      return -1;
    }
    if (artistKeysMatch(group?.artist, metadata?.artist)) {
      score += 40;
    } else {
      return -1;
    }
    if (metadata?.year && Number(group?.groupYear) === Number(metadata.year)) {
      score += 10;
    }
    return score;
  }
  function findBestGroupMatch(groups, metadata) {
    const matches = groups.map((group) => ({
      group,
      score: scoreGroupMatch(group, metadata)
    })).filter((candidate) => candidate.score >= 80).sort((left, right) => right.score - left.score);
    return {
      match: matches[0]?.group ?? null,
      candidates: matches.map((candidate) => candidate.group)
    };
  }
  async function lookupReleaseOnTracker(tracker, metadata, credential, requestJson2) {
    const payload = await requestJson2(
      buildBrowseUrl(tracker, metadata),
      tracker.buildAuthorizationHeader(credential)
    );
    const groups = Array.isArray(payload?.response?.results) ? payload.response.results : [];
    const { match, candidates } = findBestGroupMatch(groups, metadata);
    if (!match) {
      return {
        status: "missing",
        url: buildSearchPageUrl(tracker, metadata),
        title: `No likely exact ${tracker.label} group match found for ${metadata.artist} - ${metadata.title}. Click to inspect ${tracker.label} search results manually.`
      };
    }
    return {
      status: "found",
      url: buildGroupUrl(tracker, match.groupId),
      title: [
        `Matched ${match.artist} - ${match.groupName} on ${tracker.label}.`,
        candidates.length > 1 ? `${candidates.length} likely groups matched.` : null,
        Array.isArray(match.torrents) ? `${match.torrents.length} torrent entries in the matched group.` : null
      ].filter(Boolean).join(" ")
    };
  }
  async function lookupArtistOnTracker(tracker, metadata, credential, requestJson2) {
    let payload;
    try {
      payload = await requestJson2(
        buildArtistLookupUrl(tracker, metadata),
        tracker.buildAuthorizationHeader(credential)
      );
    } catch (error) {
      if (isLikelyMissingArtistError(error)) {
        return {
          status: "missing",
          url: buildSearchPageUrl(tracker, metadata),
          title: `No likely exact ${tracker.label} artist page found for ${metadata.artist}. Click to inspect ${tracker.label} search results manually.`
        };
      }
      throw error;
    }
    const artist = payload?.response;
    if (!artistKeysMatch(artist?.name, metadata?.artist)) {
      return {
        status: "missing",
        url: buildSearchPageUrl(tracker, metadata),
        title: `No likely exact ${tracker.label} artist page found for ${metadata.artist}. Click to inspect ${tracker.label} search results manually.`
      };
    }
    return {
      status: "found",
      url: buildArtistPageUrl(tracker, artist.name, artist.id),
      title: [
        `Matched ${artist.name} on ${tracker.label}.`,
        formatCount(Number(artist?.statistics?.numGroups), "group"),
        formatCount(Number(artist?.statistics?.numTorrents), "torrent entry", "torrent entries")
      ].filter(Boolean).join(" ")
    };
  }
  function lookupOnTracker(tracker, metadata, credential, requestJson2) {
    if (metadata.pageKind === "artist") {
      return lookupArtistOnTracker(tracker, metadata, credential, requestJson2);
    }
    return lookupReleaseOnTracker(tracker, metadata, credential, requestJson2);
  }

  // src/userscript.js
  var STYLE_ID = "red-on-rym-styles";
  var BADGE_ATTR = "data-red-on-rym-badge";
  var CHART_BADGE_ATTR = "data-red-on-rym-chart-badge";
  var TRACKER_MIN_INTERVAL_MS = 1200;
  var trackerQueueByHost = /* @__PURE__ */ new Map();
  var trackerNextRequestAtByHost = /* @__PURE__ */ new Map();
  function normalizeCredential(rawValue) {
    return typeof rawValue === "string" ? rawValue.trim() : "";
  }
  function addStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    [${BADGE_ATTR}] {
      position: fixed;
      left: max(16px, env(safe-area-inset-left));
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 2147483647;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      max-width: calc(100vw - 32px);
      pointer-events: none;
    }

    [${BADGE_ATTR}][data-layout="integration"],
    [${BADGE_ATTR}][data-layout="heading"],
    [${BADGE_ATTR}][data-layout="body"] {
      margin: 0;
      width: auto;
      flex-basis: auto;
    }

    [${CHART_BADGE_ATTR}] {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 10px;
      pointer-events: none;
    }

    .red-on-rym-chip {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 48px;
      padding: 12px 18px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 16px;
      background: rgba(17, 22, 28, 0.9);
      color: #f5f7fa;
      font-size: 16px;
      line-height: 1;
      text-decoration: none;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.26);
      backdrop-filter: blur(14px);
    }

    .red-on-rym-chip[href]:hover {
      text-decoration: none;
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }

    .red-on-rym-chip__label {
      font-weight: 800;
      letter-spacing: 0.02em;
    }

    .red-on-rym-chip__status {
      opacity: 0.96;
    }

    .red-on-rym-chip__dot {
      width: 11px;
      height: 11px;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.9;
      flex: 0 0 auto;
    }

    .red-on-rym-chip--pending {
      color: #c1d1e3;
    }

    .red-on-rym-chip--found {
      color: #67d69c;
    }

    .red-on-rym-chip--missing {
      color: #d7dce3;
    }

    .red-on-rym-chip--config {
      color: #ffd36b;
    }

    .red-on-rym-chip--error {
      color: #ff8d8d;
    }

    .red-on-rym-reveal {
      pointer-events: auto;
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      background: rgba(17, 22, 28, 0.86);
      color: #f5f7fa;
      min-height: 42px;
      padding: 10px 16px;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(14px);
    }

    .red-on-rym-reveal:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .red-on-rym-reveal:disabled {
      opacity: 0.72;
      cursor: progress;
    }

    @media (max-width: 640px) {
      [${BADGE_ATTR}] {
        left: max(12px, env(safe-area-inset-left));
        right: max(12px, env(safe-area-inset-right));
        bottom: max(12px, env(safe-area-inset-bottom));
        max-width: none;
        gap: 8px;
      }

      .red-on-rym-chip {
        flex: 1 1 calc(50% - 4px);
      }

      .red-on-rym-reveal {
        width: 100%;
        justify-content: center;
      }
    }
  `;
    document.head.append(style);
  }
  function getStoredCredential(storageKey) {
    if (typeof GM_getValue !== "function") {
      return "";
    }
    return normalizeCredential(GM_getValue(storageKey, ""));
  }
  function setStoredCredential(storageKey, value) {
    if (typeof GM_setValue !== "function") {
      return;
    }
    GM_setValue(storageKey, normalizeCredential(value));
  }
  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") {
      return;
    }
    for (const tracker of TRACKERS) {
      const currentCredential = getStoredCredential(tracker.credentialStorageKey);
      GM_registerMenuCommand(
        `Set ${tracker.credentialMenuLabel}${currentCredential ? " (configured)" : ""}`,
        () => {
          const nextValue = window.prompt(
            `Paste a ${tracker.credentialMenuLabel} for this script. Leave blank to clear it.`,
            currentCredential
          );
          if (nextValue === null) {
            return;
          }
          setStoredCredential(tracker.credentialStorageKey, nextValue);
          window.location.reload();
        }
      );
      if (currentCredential) {
        GM_registerMenuCommand(`Clear ${tracker.credentialMenuLabel}`, () => {
          setStoredCredential(tracker.credentialStorageKey, "");
          window.location.reload();
        });
      }
    }
  }
  function wait(durationMs) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, durationMs);
    });
  }
  async function waitForTrackerWindow(hostname) {
    const now = Date.now();
    const scheduledAt = Math.max(now, trackerNextRequestAtByHost.get(hostname) ?? now);
    trackerNextRequestAtByHost.set(hostname, scheduledAt + TRACKER_MIN_INTERVAL_MS);
    const waitMs = scheduledAt - now;
    if (waitMs > 0) {
      await wait(waitMs);
    }
  }
  function performJsonRequest(url, authorizationHeader) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        anonymous: true,
        timeout: 15e3,
        headers: {
          Accept: "application/json",
          Authorization: authorizationHeader
        },
        onload(response) {
          if (response.status === 429) {
            reject(new Error("Tracker rate limit reached"));
            return;
          }
          if (response.status === 401 || response.status === 403) {
            reject(new Error("Tracker rejected the credential"));
            return;
          }
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Tracker responded with ${response.status}`));
            return;
          }
          try {
            const payload = JSON.parse(response.responseText);
            if (payload?.status !== "success") {
              reject(new Error("Tracker returned an unsuccessful API response"));
              return;
            }
            resolve(payload);
          } catch {
            reject(new Error("Tracker returned invalid JSON"));
          }
        },
        ontimeout() {
          reject(new Error("Tracker lookup timed out"));
        },
        onerror() {
          reject(new Error("Tracker lookup failed"));
        }
      });
    });
  }
  function requestJson(url, authorizationHeader) {
    const hostname = new URL(url).hostname;
    const previousRequest = trackerQueueByHost.get(hostname) ?? Promise.resolve();
    const nextRequest = previousRequest.catch(() => {
    }).then(async () => {
      await waitForTrackerWindow(hostname);
      return performJsonRequest(url, authorizationHeader);
    });
    trackerQueueByHost.set(hostname, nextRequest.then(() => void 0, () => void 0));
    return nextRequest;
  }
  function placeBadgeHost(host, mount) {
    host.dataset.layout = mount.mode;
    if (mount.mode === "body") {
      if (host.parentElement !== mount.container || mount.container.firstElementChild !== host) {
        mount.container.prepend(host);
      }
      return;
    }
    if (host.previousElementSibling !== mount.container || host.parentElement !== mount.container.parentElement) {
      mount.container.insertAdjacentElement("afterend", host);
    }
  }
  function ensureBadgeHost() {
    const host = document.querySelector(`[${BADGE_ATTR}]`) ?? document.createElement("div");
    if (!host.hasAttribute(BADGE_ATTR)) {
      host.setAttribute(BADGE_ATTR, "");
    }
    const mount = findBadgeMount(document);
    placeBadgeHost(host, mount);
    return host;
  }
  function renderBadge(state) {
    const element = state.url ? document.createElement("a") : document.createElement("span");
    element.className = `red-on-rym-chip red-on-rym-chip--${state.status}`;
    if (state.url) {
      element.href = state.url;
      element.target = "_blank";
      element.rel = "noreferrer noopener";
    }
    if (state.title) {
      element.title = state.title;
    }
    const dot = document.createElement("span");
    dot.className = "red-on-rym-chip__dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "red-on-rym-chip__label";
    label.textContent = state.trackerLabel;
    const status = document.createElement("span");
    status.className = "red-on-rym-chip__status";
    status.textContent = state.label;
    element.append(dot, label, status);
    return element;
  }
  function updateBadges(states) {
    const host = ensureBadgeHost();
    host.replaceChildren(...states.map(renderBadge));
  }
  function buildConfigState(tracker) {
    return {
      trackerLabel: tracker.label,
      status: "config",
      label: "add key",
      title: `Set a ${tracker.credentialMenuLabel} from the Violentmonkey menu to enable ${tracker.label} lookups.`
    };
  }
  function buildPendingState(tracker, metadata) {
    return {
      trackerLabel: tracker.label,
      status: "pending",
      label: "checking...",
      title: metadata.pageKind === "artist" ? `Checking ${tracker.label} for ${metadata.artist}.` : `Checking ${tracker.label} for ${metadata.artist} - ${metadata.title}.`
    };
  }
  function buildUnexpectedErrorState(tracker) {
    return {
      trackerLabel: tracker.label,
      status: "error",
      label: "lookup failed",
      title: `Unexpected ${tracker.label} userscript failure.`
    };
  }
  function buildInitialStates(metadata) {
    return TRACKERS.map((tracker) => {
      const credential = getStoredCredential(tracker.credentialStorageKey);
      return credential ? buildPendingState(tracker, metadata) : buildConfigState(tracker);
    });
  }
  async function resolveTrackerStates(metadata) {
    return Promise.all(
      TRACKERS.map(async (tracker) => {
        const credential = getStoredCredential(tracker.credentialStorageKey);
        if (!credential) {
          return buildConfigState(tracker);
        }
        try {
          const lookupResult = await lookupOnTracker(tracker, metadata, credential, requestJson);
          return {
            trackerLabel: tracker.label,
            status: lookupResult.status,
            label: lookupResult.status === "found" ? "on site" : "not found",
            title: lookupResult.title,
            url: lookupResult.url
          };
        } catch (error) {
          return {
            trackerLabel: tracker.label,
            status: "error",
            label: "lookup failed",
            title: error instanceof Error ? error.message : `${tracker.label} lookup failed.`
          };
        }
      })
    );
  }
  function ensureChartBadgeHost(anchor) {
    const mount = anchor.closest("h1, h2, h3, h4, h5, h6") ?? anchor;
    const existingHost = mount.nextElementSibling;
    if (existingHost?.hasAttribute(CHART_BADGE_ATTR)) {
      return existingHost;
    }
    const host = document.createElement("div");
    host.setAttribute(CHART_BADGE_ATTR, "");
    mount.insertAdjacentElement("afterend", host);
    return host;
  }
  function createRevealButton(metadata) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "red-on-rym-reveal";
    button.textContent = "Show RED / OPS";
    button.title = metadata.pageKind === "artist" ? `Reveal RED and OPS availability for ${metadata.artist}.` : `Reveal RED and OPS availability for ${metadata.artist} - ${metadata.title}.`;
    return button;
  }
  async function revealChartEntry(host, metadata) {
    host.replaceChildren(...buildInitialStates(metadata).map(renderBadge));
    try {
      const results = await resolveTrackerStates(metadata);
      host.replaceChildren(...results.map(renderBadge));
    } catch {
      host.replaceChildren(...TRACKERS.map(buildUnexpectedErrorState).map(renderBadge));
    }
  }
  function initializeChartEntries(entries) {
    for (const entry of entries) {
      const host = ensureChartBadgeHost(entry.anchor);
      if (host.childElementCount > 0) {
        continue;
      }
      const button = createRevealButton(entry.metadata);
      button.addEventListener("click", () => {
        if (button.disabled) {
          return;
        }
        button.disabled = true;
        void revealChartEntry(host, entry.metadata);
      });
      host.append(button);
    }
  }
  async function main() {
    addStyles();
    registerMenuCommands();
    const chartEntries = extractChartEntries(document, window.location);
    if (chartEntries.length > 0) {
      initializeChartEntries(chartEntries);
      return;
    }
    const metadata = extractRymPageMetadata(document, window.location);
    if (!metadata) {
      return;
    }
    updateBadges(buildInitialStates(metadata));
    updateBadges(await resolveTrackerStates(metadata));
  }
  main().catch(() => {
    const metadata = extractRymPageMetadata(document, window.location);
    if (!metadata) {
      return;
    }
    updateBadges(TRACKERS.map(buildUnexpectedErrorState));
  });
})();
