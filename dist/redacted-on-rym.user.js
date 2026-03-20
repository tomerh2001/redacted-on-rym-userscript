// ==UserScript==
// @name         RED + OPS on RYM
// @namespace    https://github.com/tomerh2001/redacted-on-rym-userscript
// @version      0.2.3
// @description  Show whether the current Rate Your Music album page already exists on RED or OPS.
// @author       Tomer Horowitz
// @match        https://rateyourmusic.com/release/album/*
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      redacted.sh
// @connect      orpheus.network
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
    const preferredIntegrationContainer = doc.querySelector("#media_link_button_container_top");
    if (preferredIntegrationContainer) {
      return {
        mode: "integration",
        container: preferredIntegrationContainer
      };
    }
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

  // src/trackers.js
  var RELEASE_TYPE_IDS = {
    album: "1"
  };
  var TRACKERS = [
    {
      id: "red",
      label: "RED",
      browseEndpoint: "https://redacted.sh/ajax.php?action=browse",
      searchPage: "https://redacted.sh/torrents.php",
      groupPage: "https://redacted.sh/torrents.php",
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
      searchPage: "https://orpheus.network/torrents.php",
      groupPage: "https://orpheus.network/torrents.php",
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
  function buildSearchPageUrl(tracker, metadata) {
    const url = new URL(tracker.searchPage);
    url.searchParams.set("searchstr", `${metadata.artist} ${metadata.title}`.trim());
    url.searchParams.set("artistname", metadata.artist);
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

  // src/userscript.js
  var STYLE_ID = "red-on-rym-styles";
  var BADGE_ATTR = "data-red-on-rym-badge";
  var MOUNT_OBSERVER_ATTR = "data-red-on-rym-observing";
  var MOUNT_RETRY_TIMEOUT_MS = 5e3;
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
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin-left: 0.5rem;
      vertical-align: middle;
    }

    [${BADGE_ATTR}][data-layout="integration"],
    [${BADGE_ATTR}][data-layout="heading"],
    [${BADGE_ATTR}][data-layout="body"] {
      display: flex;
      margin-top: 0.65rem;
      margin-left: 0;
    }

    [${BADGE_ATTR}][data-layout="integration"] {
      width: 100%;
      flex-basis: 100%;
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
  function requestJson(url, authorizationHeader) {
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
  function watchForPreferredMount(host) {
    if (host.getAttribute(MOUNT_OBSERVER_ATTR) === "true" || !document.body) {
      return;
    }
    host.setAttribute(MOUNT_OBSERVER_ATTR, "true");
    const observer = new MutationObserver(() => {
      const mount = findBadgeMount(document);
      if (mount.mode !== "integration") {
        return;
      }
      placeBadgeHost(host, mount);
      host.removeAttribute(MOUNT_OBSERVER_ATTR);
      observer.disconnect();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    window.setTimeout(() => {
      observer.disconnect();
      host.removeAttribute(MOUNT_OBSERVER_ATTR);
    }, MOUNT_RETRY_TIMEOUT_MS);
  }
  function ensureBadgeHost() {
    const host = document.querySelector(`[${BADGE_ATTR}]`) ?? document.createElement("div");
    if (!host.hasAttribute(BADGE_ATTR)) {
      host.setAttribute(BADGE_ATTR, "");
    }
    const mount = findBadgeMount(document);
    placeBadgeHost(host, mount);
    if (mount.mode !== "integration") {
      watchForPreferredMount(host);
    } else {
      host.removeAttribute(MOUNT_OBSERVER_ATTR);
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
  async function main() {
    addStyles();
    registerMenuCommands();
    const metadata = extractReleaseMetadata(document, window.location);
    if (!metadata) {
      return;
    }
    updateBadges(
      TRACKERS.map((tracker) => {
        const credential = getStoredCredential(tracker.credentialStorageKey);
        if (!credential) {
          return {
            trackerLabel: tracker.label,
            status: "config",
            label: "add key",
            title: `Set a ${tracker.credentialMenuLabel} from the Violentmonkey menu to enable ${tracker.label} lookups.`
          };
        }
        return {
          trackerLabel: tracker.label,
          status: "pending",
          label: "checking...",
          title: `Checking ${tracker.label} for ${metadata.artist} - ${metadata.title}.`
        };
      })
    );
    const results = await Promise.all(
      TRACKERS.map(async (tracker) => {
        const credential = getStoredCredential(tracker.credentialStorageKey);
        if (!credential) {
          return {
            trackerLabel: tracker.label,
            status: "config",
            label: "add key",
            title: `Set a ${tracker.credentialMenuLabel} from the Violentmonkey menu to enable ${tracker.label} lookups.`
          };
        }
        try {
          const lookupResult = await lookupReleaseOnTracker(tracker, metadata, credential, requestJson);
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
    updateBadges(results);
  }
  main().catch(() => {
    updateBadges(
      TRACKERS.map((tracker) => ({
        trackerLabel: tracker.label,
        status: "error",
        label: "lookup failed",
        title: `Unexpected ${tracker.label} userscript failure.`
      }))
    );
  });
})();
