const RELEASE_PATH_RE = /^\/release\/([^/]+)\/([^/]+)\/([^/]+)\/?$/i;
const STREAMING_HOST_SUFFIXES = [
  'spotify.com',
  'apple.com',
  'tidal.com',
  'deezer.com',
  'bandcamp.com',
  'soundcloud.com',
  'youtube.com',
];

function normalizeWhitespace(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function toDisplayText(value) {
  if (!value) {
    return null;
  }

  return value
    .split(' ')
    .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export function decodeRymSlug(slug) {
  if (typeof slug !== 'string' || !slug.trim()) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(slug);
    return toDisplayText(normalizeWhitespace(decoded.replace(/\+/g, ' ').replace(/[-_]+/g, ' ')));
  } catch {
    return toDisplayText(normalizeWhitespace(slug.replace(/\+/g, ' ').replace(/[-_]+/g, ' ')));
  }
}

export function parseReleasePath(pathname) {
  const match = RELEASE_PATH_RE.exec(pathname ?? '');
  if (!match) {
    return null;
  }

  const releaseKind = match[1].toLowerCase();
  return {
    releaseKind,
    artistSlug: match[2],
    titleSlug: match[3],
    artistGuess: decodeRymSlug(match[2]),
    titleGuess: decodeRymSlug(match[3]),
  };
}

export function parseReleaseTitle(rawTitle) {
  const cleaned = normalizeWhitespace(
    String(rawTitle ?? '')
      .replace(/\s+-\s+Rate Your Music.*$/i, '')
      .replace(/\s+-\s+RYM.*$/i, ''),
  );

  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(/^(.*?)\s+by\s+(.+?)(?:\s+\(|\s+-|$)/i);
  if (!match) {
    return null;
  }

  return {
    title: normalizeWhitespace(match[1]),
    artist: normalizeWhitespace(match[2]),
  };
}

export function findLikelyReleaseYear(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return null;
  }

  const releasedMatch = text.match(/\breleased?\b[\s,:-]*(?:\d{1,2}\s+\p{L}+\s+)?(19\d{2}|20\d{2})/iu);
  if (!releasedMatch) {
    return null;
  }

  return Number(releasedMatch[1]);
}

export function normalizeMatchKey(value) {
  return normalizeWhitespace(String(value ?? ''))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[&+]/g, ' and ')
    .replace(/['’`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase()
    .trim();
}

export function isSupportedIntegrationHref(href) {
  try {
    const url = new URL(href, 'https://rateyourmusic.com');
    const hostname = url.hostname.toLowerCase();
    return STREAMING_HOST_SUFFIXES.some(suffix => hostname === suffix || hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function countServiceLinks(container, serviceLinks) {
  return serviceLinks.filter(link => container.contains(link)).length;
}

function collectCandidateContainers(link) {
  const candidates = [];
  let current = link.parentElement;
  let depth = 0;
  const stopAt = link.ownerDocument?.body ?? null;

  while (current && current !== stopAt && depth < 6) {
    candidates.push({ element: current, depth });
    current = current.parentElement;
    depth += 1;
  }

  return candidates;
}

export function findIntegrationContainer(doc = document) {
  const serviceLinks = [...doc.querySelectorAll('a[href]')].filter(link => isSupportedIntegrationHref(link.href));
  if (serviceLinks.length < 2) {
    return null;
  }

  const candidates = serviceLinks.flatMap(link => collectCandidateContainers(link));
  const scoredCandidates = candidates
    .map(candidate => {
      const serviceLinkCount = countServiceLinks(candidate.element, serviceLinks);
      const allLinkCount = candidate.element.querySelectorAll('a[href]').length;
      const descendantCount = candidate.element.querySelectorAll('*').length;

      return {
        ...candidate,
        serviceLinkCount,
        allLinkCount,
        descendantCount,
      };
    })
    .filter(candidate => candidate.serviceLinkCount >= 2 && candidate.allLinkCount <= 12 && candidate.descendantCount <= 80)
    .sort((left, right) => (
      left.allLinkCount - right.allLinkCount ||
      left.descendantCount - right.descendantCount ||
      right.serviceLinkCount - left.serviceLinkCount ||
      left.depth - right.depth
    ));

  return scoredCandidates[0]?.element ?? null;
}

export function findBadgeMount(doc = document) {
  const preferredIntegrationContainer = doc.querySelector('#media_link_button_container_top');
  if (preferredIntegrationContainer) {
    return {
      mode: 'integration',
      container: preferredIntegrationContainer,
    };
  }

  const integrationContainer = findIntegrationContainer(doc);
  if (integrationContainer) {
    return {
      mode: 'integration',
      container: integrationContainer,
    };
  }

  const heading = doc.querySelector('h1');
  if (heading) {
    return {
      mode: 'heading',
      container: heading,
    };
  }

  return {
    mode: 'body',
    container: doc.body,
  };
}

export function extractReleaseMetadata(doc = document, locationObject = window.location) {
  const pathInfo = parseReleasePath(locationObject?.pathname ?? '');
  if (!pathInfo || pathInfo.releaseKind !== 'album') {
    return null;
  }

  const titleMeta =
    doc.querySelector('meta[property="og:title"]')?.content ??
    doc.querySelector('meta[name="twitter:title"]')?.content ??
    doc.title;
  const descriptionMeta =
    doc.querySelector('meta[property="og:description"]')?.content ??
    doc.querySelector('meta[name="description"]')?.content ??
    '';
  const parsedTitle = parseReleaseTitle(titleMeta);

  return {
    releaseKind: pathInfo.releaseKind,
    artist: parsedTitle?.artist ?? pathInfo.artistGuess,
    title: parsedTitle?.title ?? pathInfo.titleGuess,
    year: findLikelyReleaseYear(descriptionMeta),
  };
}
