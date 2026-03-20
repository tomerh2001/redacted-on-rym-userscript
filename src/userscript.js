import { TRACKERS, lookupReleaseOnTracker } from './trackers.js';
import { extractReleaseMetadata, findBadgeMount } from './rym.js';

const STYLE_ID = 'red-on-rym-styles';
const BADGE_ATTR = 'data-red-on-rym-badge';

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
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin-left: 0.5rem;
      vertical-align: middle;
    }

    [${BADGE_ATTR}][data-layout="heading"],
    [${BADGE_ATTR}][data-layout="body"] {
      display: flex;
      margin-top: 0.65rem;
      margin-left: 0;
    }

    .red-on-rym-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.36rem 0.72rem;
      border: 1px solid rgba(20, 26, 34, 0.16);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.8);
      color: inherit;
      font-size: 0.82rem;
      line-height: 1;
      text-decoration: none;
      box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
    }

    .red-on-rym-chip[href]:hover {
      text-decoration: none;
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }

    .red-on-rym-chip__label {
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .red-on-rym-chip__status {
      opacity: 0.88;
    }

    .red-on-rym-chip__dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.9;
      flex: 0 0 auto;
    }

    .red-on-rym-chip--pending {
      color: #4a5c73;
    }

    .red-on-rym-chip--found {
      color: #0f7a45;
    }

    .red-on-rym-chip--missing {
      color: #5f6670;
    }

    .red-on-rym-chip--config {
      color: #946200;
    }

    .red-on-rym-chip--error {
      color: #a12d2d;
    }

    @media (prefers-color-scheme: dark) {
      .red-on-rym-chip {
        border-color: rgba(255, 255, 255, 0.14);
        background: rgba(32, 35, 39, 0.55);
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

function requestJson(url, authorizationHeader) {
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

function ensureBadgeHost() {
  const existingHost = document.querySelector(`[${BADGE_ATTR}]`);
  if (existingHost) {
    return existingHost;
  }

  const mount = findBadgeMount(document);
  const tagName =
    mount.mode === 'integration' && ['UL', 'OL'].includes(mount.container.tagName)
      ? 'li'
      : mount.mode === 'integration'
        ? 'span'
        : 'div';
  const host = document.createElement(tagName);
  host.setAttribute(BADGE_ATTR, '');
  host.dataset.layout = mount.mode;

  if (mount.mode === 'integration') {
    mount.container.append(host);
  } else if (mount.mode === 'heading') {
    mount.container.insertAdjacentElement('afterend', host);
  } else {
    mount.container.prepend(host);
  }

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

async function main() {
  addStyles();
  registerMenuCommands();

  const metadata = extractReleaseMetadata(document, window.location);
  if (!metadata) {
    return;
  }

  updateBadges(
    TRACKERS.map(tracker => {
      const credential = getStoredCredential(tracker.credentialStorageKey);
      if (!credential) {
        return {
          trackerLabel: tracker.label,
          status: 'config',
          label: 'add key',
          title: `Set a ${tracker.credentialMenuLabel} from the Violentmonkey menu to enable ${tracker.label} lookups.`,
        };
      }

      return {
        trackerLabel: tracker.label,
        status: 'pending',
        label: 'checking...',
        title: `Checking ${tracker.label} for ${metadata.artist} - ${metadata.title}.`,
      };
    }),
  );

  const results = await Promise.all(
    TRACKERS.map(async tracker => {
      const credential = getStoredCredential(tracker.credentialStorageKey);
      if (!credential) {
        return {
          trackerLabel: tracker.label,
          status: 'config',
          label: 'add key',
          title: `Set a ${tracker.credentialMenuLabel} from the Violentmonkey menu to enable ${tracker.label} lookups.`,
        };
      }

      try {
        const lookupResult = await lookupReleaseOnTracker(tracker, metadata, credential, requestJson);
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

  updateBadges(results);
}

main().catch(() => {
  updateBadges(
    TRACKERS.map(tracker => ({
      trackerLabel: tracker.label,
      status: 'error',
      label: 'lookup failed',
      title: `Unexpected ${tracker.label} userscript failure.`,
    })),
  );
});
