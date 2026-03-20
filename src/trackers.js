import { normalizeMatchKey } from './rym.js';

const RELEASE_TYPE_IDS = {
  album: '1',
};

export const TRACKERS = [
  {
    id: 'red',
    label: 'RED',
    browseEndpoint: 'https://redacted.sh/ajax.php?action=browse',
    searchPage: 'https://redacted.sh/torrents.php',
    groupPage: 'https://redacted.sh/torrents.php',
    credentialStorageKey: 'redApiKey',
    credentialMenuLabel: 'RED API key',
    buildAuthorizationHeader(credential) {
      return credential;
    },
  },
  {
    id: 'ops',
    label: 'OPS',
    browseEndpoint: 'https://orpheus.network/ajax.php?action=browse',
    searchPage: 'https://orpheus.network/torrents.php',
    groupPage: 'https://orpheus.network/torrents.php',
    credentialStorageKey: 'opsApiToken',
    credentialMenuLabel: 'OPS API token',
    buildAuthorizationHeader(credential) {
      return credential.toLowerCase().startsWith('token ') ? credential : `token ${credential}`;
    },
  },
];

function artistKeysMatch(leftValue, rightValue) {
  const leftKey = normalizeMatchKey(leftValue);
  const rightKey = normalizeMatchKey(rightValue);
  if (!leftKey || !rightKey) {
    return false;
  }

  return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

export function buildBrowseUrl(tracker, metadata) {
  const url = new URL(tracker.browseEndpoint);
  url.searchParams.set('searchstr', `${metadata.artist} ${metadata.title}`.trim());
  url.searchParams.set('artistname', metadata.artist);
  url.searchParams.set('groupname', metadata.title);
  url.searchParams.set('page', '1');

  const releaseType = RELEASE_TYPE_IDS[metadata.releaseKind];
  if (releaseType) {
    url.searchParams.set('releasetype', releaseType);
  }

  if (metadata.year) {
    url.searchParams.set('year', String(metadata.year));
  }

  return url.toString();
}

export function buildSearchPageUrl(tracker, metadata) {
  const url = new URL(tracker.searchPage);
  url.searchParams.set('searchstr', `${metadata.artist} ${metadata.title}`.trim());
  url.searchParams.set('artistname', metadata.artist);
  url.searchParams.set('groupname', metadata.title);

  const releaseType = RELEASE_TYPE_IDS[metadata.releaseKind];
  if (releaseType) {
    url.searchParams.set('releasetype', releaseType);
  }

  return url.toString();
}

function buildGroupUrl(tracker, groupId) {
  const url = new URL(tracker.groupPage);
  url.searchParams.set('id', String(groupId));
  return url.toString();
}

export function scoreGroupMatch(group, metadata) {
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

export function findBestGroupMatch(groups, metadata) {
  const matches = groups
    .map(group => ({
      group,
      score: scoreGroupMatch(group, metadata),
    }))
    .filter(candidate => candidate.score >= 80)
    .sort((left, right) => right.score - left.score);

  return {
    match: matches[0]?.group ?? null,
    candidates: matches.map(candidate => candidate.group),
  };
}

export async function lookupReleaseOnTracker(tracker, metadata, credential, requestJson) {
  const payload = await requestJson(
    buildBrowseUrl(tracker, metadata),
    tracker.buildAuthorizationHeader(credential),
  );
  const groups = Array.isArray(payload?.response?.results) ? payload.response.results : [];
  const { match, candidates } = findBestGroupMatch(groups, metadata);

  if (!match) {
    return {
      status: 'missing',
      url: buildSearchPageUrl(tracker, metadata),
      title: `No likely exact ${tracker.label} group match found for ${metadata.artist} - ${metadata.title}. Click to inspect ${tracker.label} search results manually.`,
    };
  }

  return {
    status: 'found',
    url: buildGroupUrl(tracker, match.groupId),
    title: [
      `Matched ${match.artist} - ${match.groupName} on ${tracker.label}.`,
      candidates.length > 1 ? `${candidates.length} likely groups matched.` : null,
      Array.isArray(match.torrents) ? `${match.torrents.length} torrent entries in the matched group.` : null,
    ].filter(Boolean).join(' '),
  };
}
