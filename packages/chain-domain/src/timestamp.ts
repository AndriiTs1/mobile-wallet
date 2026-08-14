/**
 * Milliseconds since the Unix epoch — matches `Date.now()` and the
 * `lastUpdatedAt` convention already used by
 * `apps/mobile/src/providers/market-data-provider.tsx`. Not seconds, not
 * an ISO 8601 string.
 */
export type UnixTimestampMs = number;
