export function normalizeRateLimitState(rawState, nowMs, rateLimit) {
  const recentRequestTimes = Array.isArray(rawState?.recentRequestTimes)
    ? rawState.recentRequestTimes
      .filter(timestamp => Number.isFinite(timestamp))
      .filter(timestamp => timestamp > nowMs - rateLimit.windowMs)
      .sort((left, right) => left - right)
    : [];

  const blockedUntilMs = Number.isFinite(rawState?.blockedUntilMs) && rawState.blockedUntilMs > nowMs
    ? rawState.blockedUntilMs
    : 0;

  return {
    recentRequestTimes,
    blockedUntilMs,
  };
}

export function reserveRateLimitSlot(rawState, rateLimit, nowMs) {
  const state = normalizeRateLimitState(rawState, nowMs, rateLimit);
  let nextAllowedAt = state.blockedUntilMs;

  if (state.recentRequestTimes.length >= rateLimit.maxRequests) {
    nextAllowedAt = Math.max(nextAllowedAt, state.recentRequestTimes[0] + rateLimit.windowMs);
  }

  if (nextAllowedAt > nowMs) {
    return {
      reserved: false,
      nextAllowedAt,
      state,
    };
  }

  return {
    reserved: true,
    nextAllowedAt: nowMs,
    state: {
      blockedUntilMs: state.blockedUntilMs,
      recentRequestTimes: [...state.recentRequestTimes, nowMs],
    },
  };
}

export function applyRateLimitBackoff(rawState, rateLimit, blockedUntilMs, nowMs) {
  const state = normalizeRateLimitState(rawState, nowMs, rateLimit);
  return {
    blockedUntilMs: Math.max(state.blockedUntilMs, blockedUntilMs || 0),
    recentRequestTimes: state.recentRequestTimes,
  };
}

export function parseRetryAfterMs(responseHeaders, nowMs = Date.now()) {
  if (typeof responseHeaders !== 'string') {
    return 0;
  }

  const match = responseHeaders.match(/^\s*retry-after\s*:\s*(\d+)\s*$/im);
  if (!match) {
    return 0;
  }

  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  return nowMs + (seconds * 1_000);
}
