import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeRymSlug,
  extractRymPageMetadata,
  findBadgeMount,
  findIntegrationContainer,
  findLikelyReleaseYear,
  isSupportedIntegrationHref,
  normalizeMatchKey,
  parseArtistPath,
  parseArtistTitle,
  parseReleasePath,
  parseReleaseTitle,
} from '../src/rym.js';

function createMockElement(name) {
  return {
    name,
    parentElement: null,
    ownerDocument: null,
    links: [],
    descendants: [],
    contains(node) {
      return this === node || this.descendants.includes(node);
    },
    querySelectorAll(selector) {
      if (selector === 'a[href]') {
        return this.links;
      }

      if (selector === '*') {
        return this.descendants;
      }

      return [];
    },
  };
}

function buildIntegrationFixture() {
  const body = createMockElement('body');
  const column = createMockElement('column');
  const mediaLinks = createMockElement('media-links');
  const heading = createMockElement('heading');
  const spotifyLink = createMockElement('spotify');
  spotifyLink.href = 'https://open.spotify.com/album/example';
  const appleLink = createMockElement('apple');
  appleLink.href = 'https://music.apple.com/us/album/example/1';
  const wikiLink = createMockElement('wiki');
  wikiLink.href = 'https://rateyourmusic.com/wiki/example';

  mediaLinks.parentElement = column;
  mediaLinks.descendants = [spotifyLink, appleLink];
  mediaLinks.links = [spotifyLink, appleLink];

  column.parentElement = body;
  column.descendants = [mediaLinks, spotifyLink, appleLink, wikiLink];
  column.links = [spotifyLink, appleLink, wikiLink];

  spotifyLink.parentElement = mediaLinks;
  spotifyLink.ownerDocument = { body };
  appleLink.parentElement = mediaLinks;
  appleLink.ownerDocument = { body };
  wikiLink.parentElement = column;
  wikiLink.ownerDocument = { body };

  const doc = {
    body,
    querySelector(selector) {
      if (selector === 'h1') {
        return heading;
      }

      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'a[href]') {
        return [spotifyLink, appleLink, wikiLink];
      }

      return [];
    },
  };

  return {
    doc,
    mediaLinks,
    heading,
  };
}

test('parseReleasePath extracts album metadata from a RYM album URL', () => {
  assert.deepEqual(parseReleasePath('/release/album/james-blake/trying-times/'), {
    releaseKind: 'album',
    artistSlug: 'james-blake',
    titleSlug: 'trying-times',
    artistGuess: 'James Blake',
    titleGuess: 'Trying Times',
  });
});

test('parseReleasePath extracts single metadata from a RYM single URL', () => {
  assert.deepEqual(
    parseReleasePath('/release/single/crocheted-doughnut-ring/two-little-ladies-azalea-and-rhododendron-nice/'),
    {
      releaseKind: 'single',
      artistSlug: 'crocheted-doughnut-ring',
      titleSlug: 'two-little-ladies-azalea-and-rhododendron-nice',
      artistGuess: 'Crocheted Doughnut Ring',
      titleGuess: 'Two Little Ladies Azalea And Rhododendron Nice',
    },
  );
});

test('parseArtistPath extracts artist metadata from a RYM artist URL', () => {
  assert.deepEqual(parseArtistPath('/artist/anna-zak/'), {
    artistSlug: 'anna-zak',
    artistGuess: 'Anna Zak',
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

test('parseArtistTitle extracts the artist name from common RYM artist title formats', () => {
  assert.equal(
    parseArtistTitle('Bad Bunny Albums: songs, discography, biography, and listening guide - Rate Your Music'),
    'Bad Bunny',
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

test('findIntegrationContainer finds the streaming links row', () => {
  const { doc, mediaLinks } = buildIntegrationFixture();

  assert.equal(findIntegrationContainer(doc), mediaLinks);
});

test('findBadgeMount prefers the streaming links row when present', () => {
  const { doc, mediaLinks } = buildIntegrationFixture();

  assert.deepEqual(findBadgeMount(doc), {
    mode: 'integration',
    container: mediaLinks,
    preferred: true,
  });
});

test('findBadgeMount falls back to the page heading when integrations are unavailable', () => {
  const heading = { tagName: 'H1' };
  const doc = {
    querySelector(selector) {
      if (selector === 'h1') {
        return heading;
      }

      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  assert.deepEqual(findBadgeMount(doc), {
    mode: 'heading',
    container: heading,
    preferred: true,
  });
});

test('findBadgeMount falls back to body when the heading is unavailable', () => {
  const body = { tagName: 'BODY' };
  const doc = {
    querySelector(selector) {
      if (selector === 'h1') {
        return null;
      }

      return null;
    },
    querySelectorAll() {
      return [];
    },
    body,
  };

  assert.deepEqual(findBadgeMount(doc), {
    mode: 'body',
    container: body,
    preferred: false,
  });
});

test('extractRymPageMetadata reads artist pages from title and heading fallbacks', () => {
  const artistHeading = { textContent: 'Anna Zak' };
  const ogTitle = {
    content: 'Anna Zak Albums: songs, discography, biography, and listening guide - Rate Your Music',
  };
  const doc = {
    title: 'Ignored Title',
    querySelector(selector) {
      if (selector === 'meta[property="og:title"]') {
        return ogTitle;
      }

      if (selector === 'h1') {
        return artistHeading;
      }

      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  assert.deepEqual(extractRymPageMetadata(doc, { pathname: '/artist/anna-zak/' }), {
    pageKind: 'artist',
    artist: 'Anna Zak',
  });
});

test('extractRymPageMetadata accepts supported non-album release types like singles', () => {
  const doc = {
    title: 'Two Little Ladies / Azalea and Rhododendron / Nice by Crocheted Doughnut Ring (Single): Reviews, Ratings, Credits - Rate Your Music',
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  assert.deepEqual(
    extractRymPageMetadata(
      doc,
      { pathname: '/release/single/crocheted-doughnut-ring/two-little-ladies-azalea-and-rhododendron-nice/' },
    ),
    {
      pageKind: 'release',
      releaseKind: 'single',
      artist: 'Crocheted Doughnut Ring',
      title: 'Two Little Ladies / Azalea and Rhododendron / Nice',
      year: null,
    },
  );
});

test('extractRymPageMetadata accepts supported non-album release types like EPs', () => {
  const doc = {
    title: 'Moon Safari by Air (EP): Reviews, Ratings, Credits - Rate Your Music',
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  assert.deepEqual(
    extractRymPageMetadata(
      doc,
      { pathname: '/release/ep/air/moon-safari/' },
    ),
    {
      pageKind: 'release',
      releaseKind: 'ep',
      artist: 'Air',
      title: 'Moon Safari',
      year: null,
    },
  );
});
