import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeRymSlug,
  findLikelyReleaseYear,
  isSupportedIntegrationHref,
  normalizeMatchKey,
  parseReleasePath,
  parseReleaseTitle,
} from '../src/rym.js';

test('parseReleasePath extracts album metadata from a RYM album URL', () => {
  assert.deepEqual(parseReleasePath('/release/album/james-blake/trying-times/'), {
    releaseKind: 'album',
    artistSlug: 'james-blake',
    titleSlug: 'trying-times',
    artistGuess: 'James Blake',
    titleGuess: 'Trying Times',
  });
});

test('decodeRymSlug turns a RYM slug into readable text', () => {
  assert.equal(decodeRymSlug('boards-of-canada'), 'Boards Of Canada');
  assert.equal(decodeRymSlug('music_has-the-right-to-children'), 'Music Has The Right To Children');
});

test('parseReleaseTitle extracts title and artist from common RYM title formats', () => {
  assert.deepEqual(
    parseReleaseTitle('Trying Times by James Blake (Album, Alternative R&B): Reviews, Ratings, Credits - Rate Your Music'),
    {
      title: 'Trying Times',
      artist: 'James Blake',
    },
  );
});

test('findLikelyReleaseYear reads a year only when release wording is present', () => {
  assert.equal(findLikelyReleaseYear('Released 11 May 2013. Reviews, credits, and more.'), 2013);
  assert.equal(findLikelyReleaseYear('Rated #12 for 2013, but no release date wording here.'), null);
});

test('normalizeMatchKey removes punctuation and diacritics for stable comparisons', () => {
  assert.equal(normalizeMatchKey('Beyoncé & JAY-Z'), 'beyonce and jay z');
  assert.equal(normalizeMatchKey("What's Going On?"), 'whats going on');
});

test('isSupportedIntegrationHref identifies likely streaming or buy-link hosts', () => {
  assert.equal(isSupportedIntegrationHref('https://open.spotify.com/album/123'), true);
  assert.equal(isSupportedIntegrationHref('https://music.apple.com/us/album/sample/123'), true);
  assert.equal(isSupportedIntegrationHref('https://rateyourmusic.com/release/album/foo/bar/'), false);
});
