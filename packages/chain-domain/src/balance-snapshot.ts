import type { AssetId } from './asset-id';
import type { AtomicAmount } from './amount';
import type { UnixTimestampMs } from './timestamp';

/**
 * A point-in-time balance read for one asset. Deliberately does not carry
 * a staleness flag/threshold itself — consumers compute that against their
 * own policy from `asOf`, matching the existing pattern in
 * `market-data-provider.tsx` (`isStale` computed on render from
 * `lastUpdatedAt`, not stored). This type is a snapshot of what a data
 * source reported; it is not itself proof of current chain state (see
 * Stage 4C research §3/§6 — signing-critical use must re-validate, never
 * trust a cached snapshot as-is).
 */
export type BalanceSnapshot = {
  readonly assetId: AssetId;
  readonly amount: AtomicAmount;
  readonly asOf: UnixTimestampMs;
};
