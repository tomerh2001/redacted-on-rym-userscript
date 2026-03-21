import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLookupCacheKey,
  createLookupCacheEntry,
  getLookupResultCacheTtlMs,
  isLookupResultCacheable,
  normalizeLookupCache,
} from '../src/lookup-cache.js';

const red = {
  id: 'red',
};

test('buildLookupCacheKey creates stable release keys', () => {
  assert.equal(
    buildLookupCacheKey(red, {
      pageKind: 'release',
      releaseKind: 'album',
      artist: 'Beyonce',
      title: "What's Going On?",
      year: 1971,
    }),
    'red|release|album|beyonce|whats going on|1971',
  );
});

test('buildLookupCacheKey creates artist keys without release fields', () => {
  assert.equal(
    buildLookupCacheKey(red, {
      pageKind: 'artist',
      artist: 'Anna Zak',
    }),
    'red|artist|anna zak',
  );
});

test('lookup cache TTLs are status-aware', () => {
  assert.equal(getLookupResultCacheTtlMs('found'), 43_200_000);
  assert.equal(getLookupResultCacheTtlMs('missing'), 3_600_000);
  assert.equal(getLookupResultCacheTtlMs('error'), 0);
});

test('isLookupResultCacheable only caches found and missing results', () => {
  assert.equal(isLookupResultCacheable({ status: 'found' }), true);
  assert.equal(isLookupResultCacheable({ status: 'missing' }), true);
  assert.equal(isLookupResultCacheable({ status: 'error' }), false);
});

test('createLookupCacheEntry stores result metadata with expiry', () => {
  assert.deepEqual(
    createLookupCacheEntry({
      status: 'found',
      title: 'Matched release',
      url: 'https://redacted.sh/torrents.php?id=1',
    }, 1_000),
    {
      storedAt: 1_000,
      expiresAt: 43_201_000,
      result: {
        status: 'found',
        title: 'Matched release',
        url: 'https://redacted.sh/torrents.php?id=1',
      },
    },
  );
});

test('normalizeLookupCache drops expired entries and keeps newest entries first', () => {
  const normalized = normalizeLookupCache({
    stale: {
      storedAt: 1_000,
      expiresAt: 2_000,
      result: { status: 'found', title: 'old', url: '' },
    },
    newest: {
      storedAt: 9_000,
      expiresAt: 19_000,
      result: { status: 'missing', title: 'new', url: '' },
    },
    older: {
      storedAt: 5_000,
      expiresAt: 15_000,
      result: { status: 'found', title: 'mid', url: '' },
    },
  }, 10_000, 1);

  assert.deepEqual(normalized, {
    newest: {
      storedAt: 9_000,
      expiresAt: 19_000,
      result: { status: 'missing', title: 'new', url: '' },
    },
  });
});
