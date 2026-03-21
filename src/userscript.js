import { extractChartEntries } from './charts.js';
import { TRACKERS, lookupOnTracker } from './trackers.js';
import { extractRymPageMetadata, findBadgeMount } from './rym.js';

const STYLE_ID = 'red-on-rym-styles';
const BADGE_ATTR = 'data-red-on-rym-badge';
const CHART_BADGE_ATTR = 'data-red-on-rym-chart-badge';
const TRACKER_MIN_INTERVAL_MS = 1_200;

const trackerQueueByHost = new Map();
const trackerNextRequestAtByHost = new Map();

function normalizeCredential(rawValue) {
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [${BADGE_ATTR}] {
      position: fixed;
      left: max(16px, env(safe-area-inset-left));
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 2147483647;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      max-width: calc(100vw - 32px);
      pointer-events: none;
    }

    [${BADGE_ATTR}][data-layout="integration"],
    [${BADGE_ATTR}][data-layout="heading"],
    [${BADGE_ATTR}][data-layout="body"] {
      margin: 0;
      width: auto;
      flex-basis: auto;
    }

    [${CHART_BADGE_ATTR}] {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 10px;
      width: 100%;
      pointer-events: none;
    }

    .red-on-rym-chip {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 48px;
      padding: 12px 18px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 16px;
      background: rgba(17, 22, 28, 0.9);
      color: #f5f7fa;
      font-size: 16px;
      line-height: 1;
      text-decoration: none;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.26);
      backdrop-filter: blur(14px);
    }

    .red-on-rym-chip[href]:hover {
      text-decoration: none;
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }

    .red-on-rym-chip__label {
      font-weight: 800;
      letter-spacing: 0.02em;
    }

    .red-on-rym-chip__status {
      opacity: 0.96;
    }

    .red-on-rym-chip__dot {
      width: 11px;
      height: 11px;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.9;
      flex: 0 0 auto;
    }

    .red-on-rym-chip--pending {
      color: #c1d1e3;
    }

    .red-on-rym-chip--found {
      color: #67d69c;
    }

    .red-on-rym-chip--missing {
      color: #d7dce3;
    }

    .red-on-rym-chip--config {
      color: #ffd36b;
    }

    .red-on-rym-chip--error {
      color: #ff8d8d;
    }

    .red-on-rym-reveal {
      pointer-events: auto;
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      background: rgba(17, 22, 28, 0.86);
      color: #f5f7fa;
      min-height: 42px;
      padding: 10px 16px;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(14px);
    }

    .red-on-rym-reveal:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .red-on-rym-reveal:disabled {
      opacity: 0.72;
      cursor: progress;
    }

    @media (max-width: 640px) {
      [${BADGE_ATTR}] {
        left: max(12px, env(safe-area-inset-left));
        right: max(12px, env(safe-area-inset-right));
        bottom: max(12px, env(safe-area-inset-bottom));
        max-width: none;
        gap: 8px;
      }

      .red-on-rym-chip {
        flex: 1 1 calc(50% - 4px);
      }

      .red-on-rym-reveal {
        width: 100%;
        justify-content: center;
      }
    }
  `;

  document.head.append(style);
}

function getStoredCredential(storageKey) {
  if (typeof GM_getValue !== 'function') {
    return '';
  }

  return normalizeCredential(GM_getValue(storageKey, ''));
}

function setStoredCredential(storageKey, value) {
  if (typeof GM_setValue !== 'function') {
    return;
  }

  GM_setValue(storageKey, normalizeCredential(value));
}

function registerMenuCommands() {
  if (typeof GM_registerMenuCommand !== 'function') {
    return;
  }

  for (const tracker of TRACKERS) {
    const currentCredential = getStoredCredential(tracker.credentialStorageKey);
    GM_registerMenuCommand(
      `Set ${tracker.credentialMenuLabel}${currentCredential ? ' (configured)' : ''}`,
      () => {
        const nextValue = window.prompt(
          `Paste a ${tracker.credentialMenuLabel} for this script. Leave blank to clear it.`,
          currentCredential,
        );
        if (nextValue === null) {
          return;
        }

        setStoredCredential(tracker.credentialStorageKey, nextValue);
        window.location.reload();
      },
    );

    if (currentCredential) {
      GM_registerMenuCommand(`Clear ${tracker.credentialMenuLabel}`, () => {
        setStoredCredential(tracker.credentialStorageKey, '');
        window.location.reload();
      });
    }
  }
}

function wait(durationMs) {
  return new Promise(resolve => {
    window.setTimeout(resolve, durationMs);
  });
}

async function waitForTrackerWindow(hostname) {
  const now = Date.now();
  const scheduledAt = Math.max(now, trackerNextRequestAtByHost.get(hostname) ?? now);
  trackerNextRequestAtByHost.set(hostname, scheduledAt + TRACKER_MIN_INTERVAL_MS);

  const waitMs = scheduledAt - now;
  if (waitMs > 0) {
    await wait(waitMs);
  }
}

function performJsonRequest(url, authorizationHeader) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      anonymous: true,
      timeout: 15_000,
      headers: {
        Accept: 'application/json',
        Authorization: authorizationHeader,
      },
      onload(response) {
        if (response.status === 429) {
          reject(new Error('Tracker rate limit reached'));
          return;
        }

        if (response.status === 401 || response.status === 403) {
          reject(new Error('Tracker rejected the credential'));
          return;
        }

        if (response.status < 200 || response.status >= 300) {
          reject(new Error(`Tracker responded with ${response.status}`));
          return;
        }

        try {
          const payload = JSON.parse(response.responseText);
          if (payload?.status !== 'success') {
            reject(new Error('Tracker returned an unsuccessful API response'));
            return;
          }

          resolve(payload);
        } catch {
          reject(new Error('Tracker returned invalid JSON'));
        }
      },
      ontimeout() {
        reject(new Error('Tracker lookup timed out'));
      },
      onerror() {
        reject(new Error('Tracker lookup failed'));
      },
    });
  });
}

// Serialize requests per tracker host so manual chart checks cannot burst fast enough to trip bans.
function requestJson(url, authorizationHeader) {
  const hostname = new URL(url).hostname;
  const previousRequest = trackerQueueByHost.get(hostname) ?? Promise.resolve();
  const nextRequest = previousRequest
    .catch(() => {})
    .then(async () => {
      await waitForTrackerWindow(hostname);
      return performJsonRequest(url, authorizationHeader);
    });

  trackerQueueByHost.set(hostname, nextRequest.then(() => undefined, () => undefined));
  return nextRequest;
}

function placeBadgeHost(host, mount) {
  host.dataset.layout = mount.mode;

  if (mount.mode === 'body') {
    if (host.parentElement !== mount.container || mount.container.firstElementChild !== host) {
      mount.container.prepend(host);
    }
    return;
  }

  if (host.previousElementSibling !== mount.container || host.parentElement !== mount.container.parentElement) {
    mount.container.insertAdjacentElement('afterend', host);
  }
}

function ensureBadgeHost() {
  const host = document.querySelector(`[${BADGE_ATTR}]`) ?? document.createElement('div');
  if (!host.hasAttribute(BADGE_ATTR)) {
    host.setAttribute(BADGE_ATTR, '');
  }

  const mount = findBadgeMount(document);
  placeBadgeHost(host, mount);

  return host;
}

function renderBadge(state) {
  const element = state.url ? document.createElement('a') : document.createElement('span');
  element.className = `red-on-rym-chip red-on-rym-chip--${state.status}`;
  if (state.url) {
    element.href = state.url;
    element.target = '_blank';
    element.rel = 'noreferrer noopener';
  }
  if (state.title) {
    element.title = state.title;
  }

  const dot = document.createElement('span');
  dot.className = 'red-on-rym-chip__dot';
  dot.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'red-on-rym-chip__label';
  label.textContent = state.trackerLabel;

  const status = document.createElement('span');
  status.className = 'red-on-rym-chip__status';
  status.textContent = state.label;

  element.append(dot, label, status);
  return element;
}

function updateBadges(states) {
  const host = ensureBadgeHost();
  host.replaceChildren(...states.map(renderBadge));
}

function buildConfigState(tracker) {
  return {
    trackerLabel: tracker.label,
    status: 'config',
    label: 'add key',
    title: `Set a ${tracker.credentialMenuLabel} from the Violentmonkey menu to enable ${tracker.label} lookups.`,
  };
}

function buildPendingState(tracker, metadata) {
  return {
    trackerLabel: tracker.label,
    status: 'pending',
    label: 'checking...',
    title: metadata.pageKind === 'artist'
      ? `Checking ${tracker.label} for ${metadata.artist}.`
      : `Checking ${tracker.label} for ${metadata.artist} - ${metadata.title}.`,
  };
}

function buildUnexpectedErrorState(tracker) {
  return {
    trackerLabel: tracker.label,
    status: 'error',
    label: 'lookup failed',
    title: `Unexpected ${tracker.label} userscript failure.`,
  };
}

function buildInitialStates(metadata) {
  return TRACKERS.map(tracker => {
    const credential = getStoredCredential(tracker.credentialStorageKey);
    return credential ? buildPendingState(tracker, metadata) : buildConfigState(tracker);
  });
}

async function resolveTrackerStates(metadata) {
  return Promise.all(
    TRACKERS.map(async tracker => {
      const credential = getStoredCredential(tracker.credentialStorageKey);
      if (!credential) {
        return buildConfigState(tracker);
      }

      try {
        const lookupResult = await lookupOnTracker(tracker, metadata, credential, requestJson);
        return {
          trackerLabel: tracker.label,
          status: lookupResult.status,
          label: lookupResult.status === 'found' ? 'on site' : 'not found',
          title: lookupResult.title,
          url: lookupResult.url,
        };
      } catch (error) {
        return {
          trackerLabel: tracker.label,
          status: 'error',
          label: 'lookup failed',
          title: error instanceof Error ? error.message : `${tracker.label} lookup failed.`,
        };
      }
    }),
  );
}

function ensureChartBadgeHost(anchor) {
  const mount = anchor.closest('h1, h2, h3, h4, h5, h6') ?? anchor;
  const existingHost = mount.nextElementSibling;
  if (existingHost?.hasAttribute(CHART_BADGE_ATTR)) {
    return existingHost;
  }

  const host = document.createElement('div');
  host.setAttribute(CHART_BADGE_ATTR, '');
  mount.insertAdjacentElement('afterend', host);
  return host;
}

function createRevealButton(metadata) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'red-on-rym-reveal';
  button.textContent = 'Show RED / OPS';
  button.title = metadata.pageKind === 'artist'
    ? `Reveal RED and OPS availability for ${metadata.artist}.`
    : `Reveal RED and OPS availability for ${metadata.artist} - ${metadata.title}.`;
  return button;
}

async function revealChartEntry(host, metadata) {
  host.replaceChildren(...buildInitialStates(metadata).map(renderBadge));
  try {
    const results = await resolveTrackerStates(metadata);
    host.replaceChildren(...results.map(renderBadge));
  } catch {
    host.replaceChildren(...TRACKERS.map(buildUnexpectedErrorState).map(renderBadge));
  }
}

function initializeChartEntries(entries) {
  for (const entry of entries) {
    const host = ensureChartBadgeHost(entry.anchor);
    if (host.childElementCount > 0) {
      continue;
    }

    const button = createRevealButton(entry.metadata);
    button.addEventListener('click', () => {
      if (button.disabled) {
        return;
      }

      button.disabled = true;
      void revealChartEntry(host, entry.metadata);
    });
    host.append(button);
  }
}

async function main() {
  addStyles();
  registerMenuCommands();

  const chartEntries = extractChartEntries(document, window.location);
  if (chartEntries.length > 0) {
    initializeChartEntries(chartEntries);
    return;
  }

  const metadata = extractRymPageMetadata(document, window.location);
  if (!metadata) {
    return;
  }

  updateBadges(buildInitialStates(metadata));
  updateBadges(await resolveTrackerStates(metadata));
}

main().catch(() => {
  const metadata = extractRymPageMetadata(document, window.location);
  if (!metadata) {
    return;
  }

  updateBadges(TRACKERS.map(buildUnexpectedErrorState));
});
