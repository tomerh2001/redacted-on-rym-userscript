import { normalizeMatchKey } from './rym.js';

const RED_BROWSE_ENDPOINT = 'https://redacted.sh/ajax.php?action=browse';
const RED_GROUP_PAGE = 'https://redacted.sh/torrents.php';
const RED_SEARCH_PAGE = 'https://redacted.sh/torrents.php';
const RELEASE_TYPE_IDS = {
  album: '1',
};

function artistKeysMatch(leftValue, rightValue) {
  const leftKey = normalizeMatchKey(leftValue);
  const rightKey = normalizeMatchKey(rightValue);
  if (!leftKey || !rightKey) {
    return false;
  }

  return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

export function buildBrowseUrl(metadata) {
  const url = new URL(RED_BROWSE_ENDPOINT);
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

export function buildSearchPageUrl(metadata) {
  const url = new URL(RED_SEARCH_PAGE);
  url.searchParams.set('searchstr', `${metadata.artist} ${metadata.title}`.trim());
  url.searchParams.set('artistname', metadata.artist);
  url.searchParams.set('groupname', metadata.title);

  const releaseType = RELEASE_TYPE_IDS[metadata.releaseKind];
  if (releaseType) {
    url.searchParams.set('releasetype', releaseType);
  }

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

function buildGroupUrl(groupId) {
  const url = new URL(RED_GROUP_PAGE);
  url.searchParams.set('id', String(groupId));
  return url.toString();
}

export async function lookupReleaseOnRed(metadata, apiKey, requestJson) {
  const payload = await requestJson(buildBrowseUrl(metadata), apiKey);
  const groups = Array.isArray(payload?.response?.results) ? payload.response.results : [];
  const { match, candidates } = findBestGroupMatch(groups, metadata);

  if (!match) {
    return {
      status: 'missing',
      url: buildSearchPageUrl(metadata),
      title: `No likely exact RED group match found for ${metadata.artist} - ${metadata.title}. Click to inspect RED search results manually.`,
    };
  }

  return {
    status: 'found',
    url: buildGroupUrl(match.groupId),
    title: [
      `Matched ${match.artist} - ${match.groupName} on RED.`,
      candidates.length > 1 ? `${candidates.length} likely groups matched.` : null,
      Array.isArray(match.torrents) ? `${match.torrents.length} torrent entries in the matched group.` : null,
    ].filter(Boolean).join(' '),
  };
}
