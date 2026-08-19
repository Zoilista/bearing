/**
 * Simple in-memory sliding window rate limiter.
 * Uses a Map keyed by identifier (IP address) storing an array of request timestamps.
 * No external dependency needed for MVP.
 */

const store = new Map<string, number[]>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5; // per window

export function checkRateLimit(identifier: string): {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
} {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Get existing timestamps, purge old ones
  const timestamps = (store.get(identifier) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS) {
    const oldest = timestamps[0]!;
    const resetInMs = oldest + WINDOW_MS - now;
    return { allowed: false, remaining: 0, resetInMs };
  }

  timestamps.push(now);
  store.set(identifier, timestamps);

  // Periodically clean up to prevent memory leak
  if (store.size > 10_000) {
    for (const [key, ts] of store.entries()) {
      if (ts.every((t) => t <= windowStart)) store.delete(key);
    }
  }

  return {
    allowed: true,
    remaining: MAX_REQUESTS - timestamps.length,
    resetInMs: 0,
  };
}
