import { normalizeMatchKey } from './rym.js';

const RELEASE_TYPE_IDS = {
  album: '1',
  single: '9',
};

export const TRACKERS = [
  {
    id: 'red',
    label: 'RED',
    browseEndpoint: 'https://redacted.sh/ajax.php?action=browse',
    artistEndpoint: 'https://redacted.sh/ajax.php?action=artist',
    searchPage: 'https://redacted.sh/torrents.php',
    groupPage: 'https://redacted.sh/torrents.php',
    artistPage: 'https://redacted.sh/artist.php',
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
    artistEndpoint: 'https://orpheus.network/ajax.php?action=artist',
    searchPage: 'https://orpheus.network/torrents.php',
    groupPage: 'https://orpheus.network/torrents.php',
    artistPage: 'https://orpheus.network/artist.php',
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

export function buildArtistLookupUrl(tracker, metadata) {
  const url = new URL(tracker.artistEndpoint);
  url.searchParams.set('artistname', metadata.artist);
  url.searchParams.set('artistreleases', '1');
  return url.toString();
}

export function buildSearchPageUrl(tracker, metadata) {
  const url = new URL(tracker.searchPage);
  url.searchParams.set('artistname', metadata.artist);

  if (metadata.pageKind === 'artist') {
    url.searchParams.set('searchstr', metadata.artist);
    return url.toString();
  }

  url.searchParams.set('searchstr', `${metadata.artist} ${metadata.title}`.trim());
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

function buildArtistPageUrl(tracker, artistName, artistId) {
  const url = new URL(tracker.artistPage);
  if (artistId) {
    url.searchParams.set('id', String(artistId));
  } else {
    url.searchParams.set('artistname', artistName);
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

export async function lookupArtistOnTracker(tracker, metadata, credential, requestJson) {
  let payload;
  try {
    payload = await requestJson(
      buildArtistLookupUrl(tracker, metadata),
      tracker.buildAuthorizationHeader(credential),
    );
  } catch (error) {
    if (isLikelyMissingArtistError(error)) {
      return {
        status: 'missing',
        url: buildSearchPageUrl(tracker, metadata),
        title: `No likely exact ${tracker.label} artist page found for ${metadata.artist}. Click to inspect ${tracker.label} search results manually.`,
      };
    }

    throw error;
  }

  const artist = payload?.response;
  if (!artistKeysMatch(artist?.name, metadata?.artist)) {
    return {
      status: 'missing',
      url: buildSearchPageUrl(tracker, metadata),
      title: `No likely exact ${tracker.label} artist page found for ${metadata.artist}. Click to inspect ${tracker.label} search results manually.`,
    };
  }

  return {
    status: 'found',
    url: buildArtistPageUrl(tracker, artist.name, artist.id),
    title: [
      `Matched ${artist.name} on ${tracker.label}.`,
      formatCount(Number(artist?.statistics?.numGroups), 'group'),
      formatCount(Number(artist?.statistics?.numTorrents), 'torrent entry', 'torrent entries'),
    ].filter(Boolean).join(' '),
  };
}

export function lookupOnTracker(tracker, metadata, credential, requestJson) {
  if (metadata.pageKind === 'artist') {
    return lookupArtistOnTracker(tracker, metadata, credential, requestJson);
  }

  return lookupReleaseOnTracker(tracker, metadata, credential, requestJson);
}
