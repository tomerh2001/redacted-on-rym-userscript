import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyRateLimitBackoff,
  normalizeRateLimitState,
  parseRetryAfterMs,
  reserveRateLimitSlot,
} from '../src/rate-limit.js';

const redRateLimit = {
  maxRequests: 10,
  windowMs: 10_000,
};

test('normalizeRateLimitState trims expired request timestamps and stale backoff', () => {
  assert.deepEqual(
    normalizeRateLimitState({
      recentRequestTimes: [1_000, 4_000, 11_000],
      blockedUntilMs: 9_000,
    }, 12_000, redRateLimit),
    {
      recentRequestTimes: [4_000, 11_000],
      blockedUntilMs: 0,
    },
  );
});

test('reserveRateLimitSlot records a request immediately while below the limit', () => {
  const reservation = reserveRateLimitSlot({
    recentRequestTimes: [1_000, 2_000],
    blockedUntilMs: 0,
  }, redRateLimit, 3_000);

  assert.equal(reservation.reserved, true);
  assert.equal(reservation.nextAllowedAt, 3_000);
  assert.deepEqual(reservation.state.recentRequestTimes, [1_000, 2_000, 3_000]);
});

test('reserveRateLimitSlot blocks until the oldest request leaves the window', () => {
  const reservation = reserveRateLimitSlot({
    recentRequestTimes: [1_000, 1_500, 2_000, 2_500, 3_000, 3_500, 4_000, 4_500, 5_000, 5_500],
    blockedUntilMs: 0,
  }, redRateLimit, 9_000);

  assert.equal(reservation.reserved, false);
  assert.equal(reservation.nextAllowedAt, 11_000);
  assert.deepEqual(reservation.state.recentRequestTimes, [1_000, 1_500, 2_000, 2_500, 3_000, 3_500, 4_000, 4_500, 5_000, 5_500]);
});

test('applyRateLimitBackoff keeps the larger blocked-until time', () => {
  const state = applyRateLimitBackoff({
    recentRequestTimes: [7_000, 11_500],
    blockedUntilMs: 14_000,
  }, redRateLimit, 18_000, 12_000);

  assert.deepEqual(state, {
    recentRequestTimes: [7_000, 11_500],
    blockedUntilMs: 18_000,
  });
});

test('parseRetryAfterMs reads Retry-After response headers', () => {
  const nowMs = 100_000;
  assert.equal(parseRetryAfterMs('Retry-After: 7', nowMs), 107_000);
  assert.equal(parseRetryAfterMs('content-type: application/json\nretry-after: 3\nx-test: ok', nowMs), 103_000);
  assert.equal(parseRetryAfterMs('x-test: ok', nowMs), 0);
});
