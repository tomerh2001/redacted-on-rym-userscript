// ==UserScript==
// @name         RED on RYM
// @namespace    https://github.com/tomerh2001/redacted-on-rym-userscript
// @version      0.1.0
// @description  Show whether the current Rate Your Music album page already exists on RED.
// @author       Tomer Horowitz
// @match        https://rateyourmusic.com/release/album/*
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      redacted.sh
// @run-at       document-idle
// @homepageURL  https://github.com/tomerh2001/redacted-on-rym-userscript
// @supportURL   https://github.com/tomerh2001/redacted-on-rym-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/tomerh2001/redacted-on-rym-userscript/main/dist/redacted-on-rym.user.js
// @updateURL    https://raw.githubusercontent.com/tomerh2001/redacted-on-rym-userscript/main/dist/redacted-on-rym.user.js
// ==/UserScript==
(() => {
  // src/rym.js
  var RELEASE_PATH_RE = /^\/release\/([^/]+)\/([^/]+)\/([^/]+)\/?$/i;
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
    const cleaned = normalizeWhitespace(
      String(rawTitle ?? "").replace(/\s+-\s+Rate Your Music.*$/i, "").replace(/\s+-\s+RYM.*$/i, "")
    );
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
        container: integrationContainer
      };
    }
    const heading = doc.querySelector("h1");
    if (heading) {
      return {
        mode: "heading",
        container: heading
      };
    }
    return {
      mode: "body",
      container: doc.body
    };
  }
  function extractReleaseMetadata(doc = document, locationObject = window.location) {
    const pathInfo = parseReleasePath(locationObject?.pathname ?? "");
    if (!pathInfo || pathInfo.releaseKind !== "album") {
      return null;
    }
    const titleMeta = doc.querySelector('meta[property="og:title"]')?.content ?? doc.querySelector('meta[name="twitter:title"]')?.content ?? doc.title;
    const descriptionMeta = doc.querySelector('meta[property="og:description"]')?.content ?? doc.querySelector('meta[name="description"]')?.content ?? "";
    const parsedTitle = parseReleaseTitle(titleMeta);
    return {
      releaseKind: pathInfo.releaseKind,
      artist: parsedTitle?.artist ?? pathInfo.artistGuess,
      title: parsedTitle?.title ?? pathInfo.titleGuess,
      year: findLikelyReleaseYear(descriptionMeta)
    };
  }

  // src/red.js
  var RED_BROWSE_ENDPOINT = "https://redacted.sh/ajax.php?action=browse";
  var RED_GROUP_PAGE = "https://redacted.sh/torrents.php";
  var RED_SEARCH_PAGE = "https://redacted.sh/torrents.php";
  var RELEASE_TYPE_IDS = {
    album: "1"
  };
  function artistKeysMatch(leftValue, rightValue) {
    const leftKey = normalizeMatchKey(leftValue);
    const rightKey = normalizeMatchKey(rightValue);
    if (!leftKey || !rightKey) {
      return false;
    }
    return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey);
  }
  function buildBrowseUrl(metadata) {
    const url = new URL(RED_BROWSE_ENDPOINT);
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
  function buildSearchPageUrl(metadata) {
    const url = new URL(RED_SEARCH_PAGE);
    url.searchParams.set("searchstr", `${metadata.artist} ${metadata.title}`.trim());
    url.searchParams.set("artistname", metadata.artist);
    url.searchParams.set("groupname", metadata.title);
    const releaseType = RELEASE_TYPE_IDS[metadata.releaseKind];
    if (releaseType) {
      url.searchParams.set("releasetype", releaseType);
    }
    return url.toString();
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
  function buildGroupUrl(groupId) {
    const url = new URL(RED_GROUP_PAGE);
    url.searchParams.set("id", String(groupId));
    return url.toString();
  }
  async function lookupReleaseOnRed(metadata, apiKey, requestJson2) {
    const payload = await requestJson2(buildBrowseUrl(metadata), apiKey);
    const groups = Array.isArray(payload?.response?.results) ? payload.response.results : [];
    const { match, candidates } = findBestGroupMatch(groups, metadata);
    if (!match) {
      return {
        status: "missing",
        url: buildSearchPageUrl(metadata),
        title: `No likely exact RED group match found for ${metadata.artist} - ${metadata.title}. Click to inspect RED search results manually.`
      };
    }
    return {
      status: "found",
      url: buildGroupUrl(match.groupId),
      title: [
        `Matched ${match.artist} - ${match.groupName} on RED.`,
        candidates.length > 1 ? `${candidates.length} likely groups matched.` : null,
        Array.isArray(match.torrents) ? `${match.torrents.length} torrent entries in the matched group.` : null
      ].filter(Boolean).join(" ")
    };
  }

  // src/userscript.js
  var API_KEY_STORAGE_KEY = "redApiKey";
  var STYLE_ID = "red-on-rym-styles";
  var BADGE_ATTR = "data-red-on-rym-badge";
  function normalizeApiKey(rawValue) {
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
      display: inline-flex;
      align-items: center;
      margin-left: 0.5rem;
      vertical-align: middle;
    }

    [${BADGE_ATTR}][data-layout="heading"],
    [${BADGE_ATTR}][data-layout="body"] {
      display: flex;
      margin-top: 0.65rem;
      margin-left: 0;
    }

    .red-on-rym-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.36rem 0.72rem;
      border: 1px solid rgba(20, 26, 34, 0.16);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.8);
      color: inherit;
      font-size: 0.82rem;
      line-height: 1;
      text-decoration: none;
      box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
    }

    .red-on-rym-chip[href]:hover {
      text-decoration: none;
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }

    .red-on-rym-chip__label {
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .red-on-rym-chip__status {
      opacity: 0.88;
    }

    .red-on-rym-chip__dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.9;
      flex: 0 0 auto;
    }

    .red-on-rym-chip--pending {
      color: #4a5c73;
    }

    .red-on-rym-chip--found {
      color: #0f7a45;
    }

    .red-on-rym-chip--missing {
      color: #5f6670;
    }

    .red-on-rym-chip--config {
      color: #946200;
    }

    .red-on-rym-chip--error {
      color: #a12d2d;
    }

    @media (prefers-color-scheme: dark) {
      .red-on-rym-chip {
        border-color: rgba(255, 255, 255, 0.14);
        background: rgba(32, 35, 39, 0.55);
      }
    }
  `;
    document.head.append(style);
  }
  function getStoredApiKey() {
    if (typeof GM_getValue !== "function") {
      return "";
    }
    return normalizeApiKey(GM_getValue(API_KEY_STORAGE_KEY, ""));
  }
  function setStoredApiKey(value) {
    if (typeof GM_setValue !== "function") {
      return;
    }
    GM_setValue(API_KEY_STORAGE_KEY, normalizeApiKey(value));
  }
  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") {
      return;
    }
    const currentApiKey = getStoredApiKey();
    GM_registerMenuCommand(
      `Set RED API key${currentApiKey ? " (configured)" : ""}`,
      () => {
        const nextValue = window.prompt(
          "Paste a RED API key for this script. Leave blank to clear it.",
          currentApiKey
        );
        if (nextValue === null) {
          return;
        }
        setStoredApiKey(nextValue);
        window.location.reload();
      }
    );
    if (currentApiKey) {
      GM_registerMenuCommand("Clear RED API key", () => {
        setStoredApiKey("");
        window.location.reload();
      });
    }
  }
  function requestJson(url, apiKey) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        anonymous: true,
        timeout: 15e3,
        headers: {
          Accept: "application/json",
          Authorization: apiKey
        },
        onload(response) {
          if (response.status === 429) {
            reject(new Error("RED rate limit reached"));
            return;
          }
          if (response.status === 401 || response.status === 403) {
            reject(new Error("RED rejected the API key"));
            return;
          }
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`RED responded with ${response.status}`));
            return;
          }
          try {
            const payload = JSON.parse(response.responseText);
            if (payload?.status !== "success") {
              reject(new Error("RED returned an unsuccessful API response"));
              return;
            }
            resolve(payload);
          } catch {
            reject(new Error("RED returned invalid JSON"));
          }
        },
        ontimeout() {
          reject(new Error("RED lookup timed out"));
        },
        onerror() {
          reject(new Error("RED lookup failed"));
        }
      });
    });
  }
  function ensureBadgeHost() {
    const existingHost = document.querySelector(`[${BADGE_ATTR}]`);
    if (existingHost) {
      return existingHost;
    }
    const mount = findBadgeMount(document);
    const tagName = mount.mode === "integration" && ["UL", "OL"].includes(mount.container.tagName) ? "li" : mount.mode === "integration" ? "span" : "div";
    const host = document.createElement(tagName);
    host.setAttribute(BADGE_ATTR, "");
    host.dataset.layout = mount.mode;
    if (mount.mode === "integration") {
      mount.container.append(host);
    } else if (mount.mode === "heading") {
      mount.container.insertAdjacentElement("afterend", host);
    } else {
      mount.container.prepend(host);
    }
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
    label.textContent = "RED";
    const status = document.createElement("span");
    status.className = "red-on-rym-chip__status";
    status.textContent = state.label;
    element.append(dot, label, status);
    return element;
  }
  function updateBadge(state) {
    const host = ensureBadgeHost();
    host.replaceChildren(renderBadge(state));
  }
  async function main() {
    addStyles();
    registerMenuCommands();
    const metadata = extractReleaseMetadata(document, window.location);
    if (!metadata) {
      return;
    }
    const apiKey = getStoredApiKey();
    if (!apiKey) {
      updateBadge({
        status: "config",
        label: "add API key",
        title: "Set a limited RED API key from the Violentmonkey menu to enable lookups."
      });
      return;
    }
    updateBadge({
      status: "pending",
      label: "checking...",
      title: `Checking RED for ${metadata.artist} - ${metadata.title}.`
    });
    try {
      const lookupResult = await lookupReleaseOnRed(metadata, apiKey, requestJson);
      updateBadge({
        status: lookupResult.status,
        label: lookupResult.status === "found" ? "on site" : "not found",
        title: lookupResult.title,
        url: lookupResult.url
      });
    } catch (error) {
      updateBadge({
        status: "error",
        label: "lookup failed",
        title: error instanceof Error ? error.message : "RED lookup failed."
      });
    }
  }
  main().catch(() => {
    updateBadge({
      status: "error",
      label: "lookup failed",
      title: "Unexpected userscript failure."
    });
  });
})();
