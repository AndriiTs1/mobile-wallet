import type { AtomicAmount, DecimalString } from './amount';
import type { UnixTimestampMs } from './timestamp';

/**
 * Bitcoin and Ethereum fee markets are structurally different (a single
 * sat/vB rate vs. EIP-1559's base/priority-fee components) — modeled as an
 * explicit discriminated union rather than forced into one shape.
 */
export type BitcoinFeeQuote = {
  readonly chainId: 'bitcoin:mainnet';
  /** Fee rate, not an atomic amount — may legitimately be fractional. */
  readonly satsPerVByte: DecimalString;
  readonly asOf: UnixTimestampMs;
};

export type EthereumFeeQuote = {
  readonly chainId: 'ethereum:mainnet';
  readonly maxFeePerGasWei: AtomicAmount;
  readonly maxPriorityFeePerGasWei: AtomicAmount;
  readonly asOf: UnixTimestampMs;
};

export type FeeQuote = BitcoinFeeQuote | EthereumFeeQuote;
