import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBrowseUrl,
  buildSearchPageUrl,
  findBestGroupMatch,
  scoreGroupMatch,
} from '../src/red.js';

const metadata = {
  releaseKind: 'album',
  artist: 'James Blake',
  title: 'Trying Times',
  year: 2013,
};

test('buildBrowseUrl encodes the expected RED browse search parameters', () => {
  const url = new URL(buildBrowseUrl(metadata));
  assert.equal(url.origin + url.pathname, 'https://redacted.sh/ajax.php');
  assert.equal(url.searchParams.get('action'), 'browse');
  assert.equal(url.searchParams.get('artistname'), 'James Blake');
  assert.equal(url.searchParams.get('groupname'), 'Trying Times');
  assert.equal(url.searchParams.get('releasetype'), '1');
  assert.equal(url.searchParams.get('year'), '2013');
});

test('buildSearchPageUrl links to the equivalent manual RED search', () => {
  const url = new URL(buildSearchPageUrl(metadata));
  assert.equal(url.origin + url.pathname, 'https://redacted.sh/torrents.php');
  assert.equal(url.searchParams.get('artistname'), 'James Blake');
  assert.equal(url.searchParams.get('groupname'), 'Trying Times');
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
