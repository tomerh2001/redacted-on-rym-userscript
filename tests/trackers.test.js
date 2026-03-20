import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRACKERS,
  buildBrowseUrl,
  buildSearchPageUrl,
  findBestGroupMatch,
  scoreGroupMatch,
} from '../src/trackers.js';

const metadata = {
  releaseKind: 'album',
  artist: 'James Blake',
  title: 'Trying Times',
  year: 2013,
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

test('buildSearchPageUrl links to the equivalent manual tracker search', () => {
  const red = TRACKERS.find(tracker => tracker.id === 'red');
  const ops = TRACKERS.find(tracker => tracker.id === 'ops');

  const redUrl = new URL(buildSearchPageUrl(red, metadata));
  const opsUrl = new URL(buildSearchPageUrl(ops, metadata));

  assert.equal(redUrl.origin + redUrl.pathname, 'https://redacted.sh/torrents.php');
  assert.equal(opsUrl.origin + opsUrl.pathname, 'https://orpheus.network/torrents.php');
});

test('OPS auth header helper prefers the token prefix', () => {
  const ops = TRACKERS.find(tracker => tracker.id === 'ops');
  assert.equal(ops.buildAuthorizationHeader('abc123'), 'token abc123');
  assert.equal(ops.buildAuthorizationHeader('token abc123'), 'token abc123');
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
