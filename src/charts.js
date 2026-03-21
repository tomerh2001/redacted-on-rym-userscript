import { isSupportedReleaseKind, normalizeWhitespace, parseReleasePath } from './rym.js';

const CHARTS_PATH_RE = /^\/charts\//i;

function getAnchorHref(anchor) {
  if (typeof anchor?.getAttribute === 'function') {
    const attributeHref = anchor.getAttribute('href');
    if (attributeHref) {
      return attributeHref;
    }
  }

  return anchor?.href ?? '';
}

function scoreChartAnchor(anchor) {
  let score = 0;
  const text = normalizeWhitespace(anchor?.textContent ?? '');
  if (text) {
    score += 10;
  }

  const parentTagName = String(anchor?.parentElement?.tagName ?? '').toUpperCase();
  if (/^H[1-6]$/.test(parentTagName)) {
    score += 20;
  }

  const classNames = [
    anchor?.className,
    anchor?.parentElement?.className,
  ].filter(value => typeof value === 'string').join(' ');
  if (/\b(title|release|chart|name)\b/i.test(classNames)) {
    score += 5;
  }

  return score;
}

function buildChartEntry(anchor) {
  try {
    const href = getAnchorHref(anchor);
    const url = new URL(href, 'https://rateyourmusic.com');
    const pathInfo = parseReleasePath(url.pathname);
    if (!pathInfo || !isSupportedReleaseKind(pathInfo.releaseKind)) {
      return null;
    }

    return {
      key: url.pathname,
      href: url.toString(),
      anchor,
      score: scoreChartAnchor(anchor),
      metadata: {
        pageKind: 'release',
        releaseKind: pathInfo.releaseKind,
        artist: pathInfo.artistGuess,
        title: normalizeWhitespace(anchor?.textContent ?? '') || pathInfo.titleGuess,
        year: null,
      },
    };
  } catch {
    return null;
  }
}

export function isChartsPath(pathname) {
  return CHARTS_PATH_RE.test(pathname ?? '');
}

export function extractChartEntries(doc = document, locationObject = window.location) {
  if (!isChartsPath(locationObject?.pathname ?? '')) {
    return [];
  }

  const bestEntriesByKey = new Map();
  for (const anchor of [...doc.querySelectorAll('a[href]')]) {
    const entry = buildChartEntry(anchor);
    if (!entry?.metadata?.artist || !entry.metadata.title) {
      continue;
    }

    const existing = bestEntriesByKey.get(entry.key);
    if (!existing || entry.score > existing.score) {
      bestEntriesByKey.set(entry.key, entry);
    }
  }

  return [...bestEntriesByKey.values()].map(({ score, ...entry }) => entry);
}
