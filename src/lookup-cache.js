import { normalizeMatchKey } from './rym.js';

const LOOKUP_RESULT_TTL_MS = {
  found: 12 * 60 * 60 * 1_000,
  missing: 60 * 60 * 1_000,
};

export function buildLookupCacheKey(tracker, metadata) {
  const trackerId = tracker?.id ?? '';
  const pageKind = metadata?.pageKind ?? '';
  const artistKey = normalizeMatchKey(metadata?.artist);

  if (pageKind === 'artist') {
    return [trackerId, pageKind, artistKey].join('|');
  }

  return [
    trackerId,
    pageKind,
    metadata?.releaseKind ?? '',
    artistKey,
    normalizeMatchKey(metadata?.title),
    Number.isFinite(metadata?.year) ? String(metadata.year) : '',
  ].join('|');
}

export function getLookupResultCacheTtlMs(status) {
  return LOOKUP_RESULT_TTL_MS[status] ?? 0;
}

export function isLookupResultCacheable(result) {
  return getLookupResultCacheTtlMs(result?.status) > 0;
}

export function normalizeLookupCache(rawCache, nowMs, maxEntries) {
  const entries = Object.entries(rawCache ?? {})
    .filter(([key, entry]) => {
      if (!key || !entry || typeof entry !== 'object') {
        return false;
      }

      const storedAt = Number(entry.storedAt);
      const expiresAt = Number(entry.expiresAt);
      if (!Number.isFinite(storedAt) || !Number.isFinite(expiresAt) || expiresAt <= nowMs) {
        return false;
      }

      return isLookupResultCacheable(entry.result);
    })
    .sort((left, right) => Number(right[1].storedAt) - Number(left[1].storedAt));

  return Object.fromEntries(entries.slice(0, maxEntries));
}

export function createLookupCacheEntry(result, nowMs) {
  return {
    storedAt: nowMs,
    expiresAt: nowMs + getLookupResultCacheTtlMs(result.status),
    result: {
      status: result.status,
      title: result.title ?? '',
      url: result.url ?? '',
    },
  };
}
