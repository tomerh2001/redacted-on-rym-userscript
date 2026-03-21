import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRACKERS,
  buildArtistLookupUrl,
  buildBrowseUrl,
  buildSearchPageUrl,
  findBestGroupMatch,
  lookupArtistOnTracker,
  lookupOnTracker,
  scoreGroupMatch,
} from '../src/trackers.js';

const metadata = {
  pageKind: 'release',
  releaseKind: 'album',
  artist: 'James Blake',
  title: 'Trying Times',
  year: 2013,
};

const singleMetadata = {
  pageKind: 'release',
  releaseKind: 'single',
  artist: 'Crocheted Doughnut Ring',
  title: 'Two Little Ladies / Azalea and Rhododendron / Nice',
  year: 2009,
};

const epMetadata = {
  pageKind: 'release',
  releaseKind: 'ep',
  artist: 'Air',
  title: 'Moon Safari',
  year: 1998,
};

const artistMetadata = {
  pageKind: 'artist',
  artist: 'Anna Zak',
};

test('buildBrowseUrl encodes the expected RED browse search parameters', () => {
  const red = TRACKERS.find(tracker => tracker.id === 'red');
  const url = new URL(buildBrowseUrl(red, metadata));
  assert.equal(url.origin + url.pathname, 'https://redacted.sh/ajax.php');
  assert.equal(url.searchParams.get('action'), 'browse');
  assert.equal(url.searchParams.get('artistname'), 'James Blake');
  assert.equal(url.searchParams.get('groupname'), 'Trying Times');
  assert.equal(url.searchParams.get('releasetype'), '1');
  assert.equal(url.searchParams.get('year'), '2013');
});

test('buildBrowseUrl encodes the expected OPS browse search parameters', () => {
  const ops = TRACKERS.find(tracker => tracker.id === 'ops');
  const url = new URL(buildBrowseUrl(ops, metadata));
  assert.equal(url.origin + url.pathname, 'https://orpheus.network/ajax.php');
  assert.equal(url.searchParams.get('action'), 'browse');
  assert.equal(url.searchParams.get('artistname'), 'James Blake');
  assert.equal(url.searchParams.get('groupname'), 'Trying Times');
  assert.equal(url.searchParams.get('releasetype'), '1');
});

test('buildBrowseUrl maps singles to the tracker single release type', () => {
  const red = TRACKERS.find(tracker => tracker.id === 'red');
  const url = new URL(buildBrowseUrl(red, singleMetadata));
  assert.equal(url.searchParams.get('artistname'), 'Crocheted Doughnut Ring');
  assert.equal(url.searchParams.get('groupname'), 'Two Little Ladies / Azalea and Rhododendron / Nice');
  assert.equal(url.searchParams.get('releasetype'), '9');
  assert.equal(url.searchParams.get('year'), '2009');
});

test('buildBrowseUrl maps EPs to the tracker EP release type', () => {
  const red = TRACKERS.find(tracker => tracker.id === 'red');
  const url = new URL(buildBrowseUrl(red, epMetadata));
  assert.equal(url.searchParams.get('artistname'), 'Air');
  assert.equal(url.searchParams.get('groupname'), 'Moon Safari');
  assert.equal(url.searchParams.get('releasetype'), '5');
  assert.equal(url.searchParams.get('year'), '1998');
});

test('buildSearchPageUrl links to the equivalent manual tracker search', () => {
  const red = TRACKERS.find(tracker => tracker.id === 'red');
  const ops = TRACKERS.find(tracker => tracker.id === 'ops');

  const redUrl = new URL(buildSearchPageUrl(red, metadata));
  const opsUrl = new URL(buildSearchPageUrl(ops, metadata));

  assert.equal(redUrl.origin + redUrl.pathname, 'https://redacted.sh/torrents.php');
  assert.equal(opsUrl.origin + opsUrl.pathname, 'https://orpheus.network/torrents.php');
});

test('buildArtistLookupUrl encodes the expected artist lookup parameters', () => {
  const red = TRACKERS.find(tracker => tracker.id === 'red');
  const url = new URL(buildArtistLookupUrl(red, artistMetadata));
  assert.equal(url.origin + url.pathname, 'https://redacted.sh/ajax.php');
  assert.equal(url.searchParams.get('action'), 'artist');
  assert.equal(url.searchParams.get('artistname'), 'Anna Zak');
  assert.equal(url.searchParams.get('artistreleases'), '1');
});

test('buildSearchPageUrl links artist lookups to manual tracker search results', () => {
  const red = TRACKERS.find(tracker => tracker.id === 'red');
  const url = new URL(buildSearchPageUrl(red, artistMetadata));
  assert.equal(url.origin + url.pathname, 'https://redacted.sh/torrents.php');
  assert.equal(url.searchParams.get('artistname'), 'Anna Zak');
  assert.equal(url.searchParams.get('searchstr'), 'Anna Zak');
  assert.equal(url.searchParams.get('groupname'), null);
});

test('OPS auth header helper prefers the token prefix', () => {
  const ops = TRACKERS.find(tracker => tracker.id === 'ops');
  assert.equal(ops.buildAuthorizationHeader('abc123'), 'token abc123');
  assert.equal(ops.buildAuthorizationHeader('token abc123'), 'token abc123');
});

test('tracker configs include the documented RED and OPS API rate limits', () => {
  const red = TRACKERS.find(tracker => tracker.id === 'red');
  const ops = TRACKERS.find(tracker => tracker.id === 'ops');

  assert.deepEqual(red.rateLimit, {
    maxRequests: 10,
    windowMs: 10_000,
  });
  assert.deepEqual(ops.rateLimit, {
    maxRequests: 5,
    windowMs: 10_000,
  });
});

test('scoreGroupMatch prefers exact-ish title and artist matches', () => {
  assert.equal(scoreGroupMatch({
    groupName: 'Trying Times',
    artist: 'James Blake',
    groupYear: 2013,
  }, metadata), 110);

  assert.equal(scoreGroupMatch({
    groupName: 'Different Release',
    artist: 'James Blake',
    groupYear: 2013,
  }, metadata), -1);
});

test('findBestGroupMatch returns the strongest exact candidate', () => {
  const { match, candidates } = findBestGroupMatch([
    {
      groupId: 10,
      groupName: 'Trying Times',
      artist: 'James Blake',
      groupYear: 2013,
    },
    {
      groupId: 11,
      groupName: 'Trying Times Live',
      artist: 'James Blake',
      groupYear: 2014,
    },
  ], metadata);

  assert.equal(match?.groupId, 10);
  assert.equal(candidates.length, 1);
});

test('lookupArtistOnTracker returns the tracker artist page when the API matches', async () => {
  const red = TRACKERS.find(tracker => tracker.id === 'red');
  const seen = [];
  const result = await lookupArtistOnTracker(red, artistMetadata, 'fixture-red-key', async (url, auth) => {
    seen.push({ url, auth });
    return {
      status: 'success',
      response: {
        id: 991,
        name: 'Anna Zak',
        statistics: {
          numGroups: 7,
          numTorrents: 19,
        },
      },
    };
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].auth, 'fixture-red-key');
  assert.equal(result.status, 'found');
  assert.equal(result.url, 'https://redacted.sh/artist.php?id=991');
  assert.match(result.title, /Matched Anna Zak on RED\./);
  assert.match(result.title, /7 groups\./);
  assert.match(result.title, /19 torrent entries\./);
});

test('lookupArtistOnTracker converts a missing artist response into a manual-review state', async () => {
  const ops = TRACKERS.find(tracker => tracker.id === 'ops');
  const result = await lookupArtistOnTracker(ops, artistMetadata, 'fixture-ops-token', async () => {
    throw new Error('Tracker returned unsuccessful API response');
  });

  assert.equal(result.status, 'missing');
  assert.match(result.url, /^https:\/\/orpheus\.network\/torrents\.php\?/);
  assert.match(result.title, /No likely exact OPS artist page found/);
});

test('lookupOnTracker dispatches artist pages through the artist lookup flow', async () => {
  const red = TRACKERS.find(tracker => tracker.id === 'red');
  const result = await lookupOnTracker(red, artistMetadata, 'fixture-red-key', async () => ({
    status: 'success',
    response: {
      id: 991,
      name: 'Anna Zak',
      statistics: {
        numGroups: 1,
        numTorrents: 2,
      },
    },
  }));

  assert.equal(result.status, 'found');
  assert.equal(result.url, 'https://redacted.sh/artist.php?id=991');
});
