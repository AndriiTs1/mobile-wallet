import { toAtomicAmount, type AtomicAmount, type BalanceSnapshot, type BitcoinUtxo } from 'chain-domain';

import { attemptProvidersInOrder, fetchWithTimeout, type ProviderAttempt } from './provider-failover';

export type BitcoinIndexerProvider = {
  readonly id: string;
  readonly apiBase: string;
};

/**
 * Two independent, public, keyless Esplora-style Bitcoin mainnet indexers.
 * Both verified live during Stage 4C.3/4C.4 — Blockstream's response for
 * the Stage 4C.3 demo address matched mempool.space's `chain_stats`
 * exactly (funded_txo_sum and spent_txo_sum identical), cross-validating
 * both instances. Chosen per Stage 4C research: raw Bitcoin Core RPC alone
 * cannot efficiently answer "what UTXOs/history does address X have"
 * without the caller running its own indexed wallet import — an
 * Esplora-style REST API is the right category for this proof.
 * Provisional-for-proof only, not an ADR-006 provider selection.
 */
const BITCOIN_PROVIDERS: readonly BitcoinIndexerProvider[] = [
  { id: 'mempool.space', apiBase: 'https://mempool.space/api' },
  { id: 'blockstream.info', apiBase: 'https://blockstream.info/api' },
];

/**
 * Bitcoin's fixed protocol-level supply cap: 21,000,000 BTC = 2.1e15
 * satoshis. Well under `Number.MAX_SAFE_INTEGER` (2^53 - 1 ≈ 9.007e15).
 * This bound is only meaningful for values that represent CURRENT chain
 * state (a single UTXO's value, a current balance) — see
 * `assertSafeCurrentSatoshiValue` below. It must NOT be applied to
 * Esplora's cumulative `funded_txo_sum`/`spent_txo_sum` fields: those are
 * lifetime flow totals, and the same satoshis can enter and leave an
 * address repeatedly over its history, so a sufficiently active address's
 * cumulative totals can legitimately exceed the 21M BTC supply cap.
 */
const SATOSHI_SUPPLY_CAP = 2_100_000_000_000_000;
const SATOSHI_SUPPLY_CAP_BIGINT = BigInt(SATOSHI_SUPPLY_CAP);

/**
 * Baseline validity for ANY provider-supplied satoshi-denominated integer,
 * current or cumulative: non-negative, and — critically —
 * `Number.isSafeInteger`, not merely `Number.isInteger`. `JSON.parse`
 * converts every JSON number into a JS `Number` before our code ever sees
 * it; a value outside ±(2^53 − 1) may already have been silently rounded
 * by the JSON parser itself, with no way for us to detect that after the
 * fact. Rejecting anything outside the safe-integer range here is a
 * fail-closed rule: an "integer-looking" unsafe value is treated as
 * untrustworthy, not silently accepted. If a future provider response
 * genuinely requires values beyond this range, that requires introducing
 * a lossless wire representation (e.g. numbers-as-strings, a custom JSON
 * parser) — not weakening this check. Not needed for Stage 4C.3/4C.4: the
 * live provider responses do not exceed this range (verified below).
 */
function assertSafeNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid satoshi value for "${fieldName}": ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Stricter validity for a value that represents CURRENT chain state (a
 * single UTXO's value) — additionally bounded by Bitcoin's total supply
 * cap, since no single current output can exceed total possible supply.
 * Do not use this for cumulative stat fields (see the cap's own doc
 * comment above).
 */
function assertSafeCurrentSatoshiValue(value: unknown, fieldName: string): number {
  const safe = assertSafeNonNegativeInteger(value, fieldName);
  if (safe > SATOSHI_SUPPLY_CAP) {
    throw new Error(`Satoshi value for "${fieldName}" exceeds Bitcoin's total supply cap: ${safe}`);
  }
  return safe;
}

// Format-only validation (native SegWit / bech32 mainnet, per ADR-003) —
// not a chain-domain type, since address-format safety is the only thing
// needed here and promoting it to a shared branded type was judged
// premature for a single proof stage (see Stage 4C.3 inspection notes).
const BECH32_MAINNET_PATTERN = /^bc1[023456789acdefghjklmnpqrstuvwxyz]{6,87}$/;

function assertBitcoinMainnetAddress(address: string): void {
  if (!BECH32_MAINNET_PATTERN.test(address)) {
    throw new Error(`Invalid Bitcoin mainnet bech32 address: "${address}"`);
  }
}

async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {});
  } catch (error) {
    throw new Error(`Failed to reach Bitcoin indexer: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new Error(`Bitcoin indexer request failed with status ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Bitcoin indexer response was not valid JSON');
  }
}

type BitcoinAddressStatsResult = {
  readonly confirmedBalance: BalanceSnapshot;
  /** Net mempool_stats delta (funded − spent), signed — may be negative if
   * the address is spending confirmed funds in a still-unconfirmed
   * transaction. Deliberately not an `AtomicAmount` (non-negative only). */
  readonly unconfirmedDeltaSats: bigint;
};

async function fetchBitcoinAddressStats(
  address: string,
  apiBase: string,
): Promise<BitcoinAddressStatsResult> {
  const payload = await fetchJson(`${apiBase}/address/${address}`);
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Bitcoin address stats response was not a JSON object');
  }
  const body = payload as Record<string, unknown>;

  const chainStats = body.chain_stats;
  const mempoolStats = body.mempool_stats;
  if (typeof chainStats !== 'object' || chainStats === null) {
    throw new Error('Bitcoin address stats response is missing chain_stats');
  }
  if (typeof mempoolStats !== 'object' || mempoolStats === null) {
    throw new Error('Bitcoin address stats response is missing mempool_stats');
  }
  const chain = chainStats as Record<string, unknown>;
  const mempool = mempoolStats as Record<string, unknown>;

  // Cumulative lifetime totals — NOT current-state values, so the supply
  // cap does not apply (see assertSafeNonNegativeInteger's doc comment).
  const chainFunded = assertSafeNonNegativeInteger(chain.funded_txo_sum, 'chain_stats.funded_txo_sum');
  const chainSpent = assertSafeNonNegativeInteger(chain.spent_txo_sum, 'chain_stats.spent_txo_sum');
  const mempoolFunded = assertSafeNonNegativeInteger(
    mempool.funded_txo_sum,
    'mempool_stats.funded_txo_sum',
  );
  const mempoolSpent = assertSafeNonNegativeInteger(
    mempool.spent_txo_sum,
    'mempool_stats.spent_txo_sum',
  );

  const confirmedSats = BigInt(chainFunded) - BigInt(chainSpent);
  if (confirmedSats < 0n) {
    throw new Error('Bitcoin address stats reported spent_txo_sum greater than funded_txo_sum');
  }
  // This difference DOES represent current state (a current balance), so
  // the supply-cap sanity check is meaningful here even though it wasn't
  // applied to the cumulative inputs above.
  if (confirmedSats > SATOSHI_SUPPLY_CAP_BIGINT) {
    throw new Error('Bitcoin address stats derived a confirmed balance exceeding the total supply cap');
  }

  return {
    confirmedBalance: {
      assetId: { kind: 'native', chainId: 'bitcoin:mainnet' },
      amount: toAtomicAmount(confirmedSats.toString(10)),
      asOf: Date.now(),
    },
    unconfirmedDeltaSats: BigInt(mempoolFunded) - BigInt(mempoolSpent),
  };
}

const TXID_PATTERN = /^[0-9a-f]{64}$/;

async function fetchBitcoinAddressUtxos(address: string, apiBase: string): Promise<BitcoinUtxo[]> {
  const payload = await fetchJson(`${apiBase}/address/${address}/utxo`);
  if (!Array.isArray(payload)) {
    throw new Error('Bitcoin address UTXO response was not a JSON array');
  }

  return payload.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`Bitcoin UTXO at index ${index} was not a JSON object`);
    }
    const utxo = entry as Record<string, unknown>;

    const txid = utxo.txid;
    if (typeof txid !== 'string' || !TXID_PATTERN.test(txid)) {
      throw new Error(`Bitcoin UTXO at index ${index} has an invalid txid: ${JSON.stringify(txid)}`);
    }

    const vout = utxo.vout;
    if (typeof vout !== 'number' || !Number.isSafeInteger(vout) || vout < 0) {
      throw new Error(`Bitcoin UTXO at index ${index} has an invalid vout: ${JSON.stringify(vout)}`);
    }

    // A single UTXO's value is current chain state, so the supply-cap
    // bound is meaningful here (unlike the cumulative stats fields above).
    const value = assertSafeCurrentSatoshiValue(utxo.value, `utxo[${index}].value`);

    const status = utxo.status;
    if (
      typeof status !== 'object' ||
      status === null ||
      typeof (status as Record<string, unknown>).confirmed !== 'boolean'
    ) {
      throw new Error(`Bitcoin UTXO at index ${index} has an invalid status`);
    }

    return {
      txid,
      vout,
      value: toAtomicAmount(value.toString(10)),
      confirmed: (status as Record<string, unknown>).confirmed as boolean,
    };
  });
}

/**
 * Fetches both required pieces (address stats + UTXOs) from ONE provider.
 * This is the atomic failover unit: `Promise.all` means if either request
 * or its validation fails, the WHOLE attempt for this provider rejects —
 * `attemptProvidersInOrder` then moves to the next provider fresh, never
 * combining stats from one provider with UTXOs from another.
 */
async function fetchFromOneBitcoinProvider(
  address: string,
  apiBase: string,
): Promise<{ stats: BitcoinAddressStatsResult; utxos: BitcoinUtxo[] }> {
  const [stats, utxos] = await Promise.all([
    fetchBitcoinAddressStats(address, apiBase),
    fetchBitcoinAddressUtxos(address, apiBase),
  ]);
  return { stats, utxos };
}

export type BitcoinAddressProof = {
  readonly address: string;
  /** Which provider actually served this result — infrastructure/
   * diagnostic metadata, not chain-domain data. */
  readonly providerId: string;
  readonly confirmedBalance: BalanceSnapshot;
  readonly unconfirmedDeltaSats: bigint;
  readonly utxos: readonly BitcoinUtxo[];
  readonly utxoTotalSats: AtomicAmount;
  readonly asOf: number;
};

/**
 * Fetches address-level read-only Bitcoin mainnet state via direct-device
 * Esplora-style REST (Stage 4C: direct-device access for core wallet
 * reads). Read-only — no key material is involved or required; an address
 * is public query input.
 *
 * Tries `providers` in order, stopping at the first fully-successful
 * attempt (Stage 4C.4: sequential-only, never parallel). Stats and UTXOs
 * always come from the same provider attempt — see
 * `fetchFromOneBitcoinProvider`.
 *
 * This is an ADDRESS-level proof only, not a wallet balance: it reflects
 * exactly what this one queried address currently shows via the indexer,
 * not any notion of a complete wallet across multiple addresses/branches
 * (which would require the BIP-84 discovery process ADR-003 §6 defines —
 * out of scope here).
 */
export async function fetchBitcoinMainnetAddressProof(
  address: string,
  providers: readonly BitcoinIndexerProvider[] = BITCOIN_PROVIDERS,
): Promise<BitcoinAddressProof> {
  assertBitcoinMainnetAddress(address);

  const attempts: ProviderAttempt<{ stats: BitcoinAddressStatsResult; utxos: BitcoinUtxo[] }>[] =
    providers.map((provider) => ({
      id: provider.id,
      run: () => fetchFromOneBitcoinProvider(address, provider.apiBase),
    }));

  const { result, providerId } = await attemptProvidersInOrder(attempts);
  const { stats, utxos } = result;

  const utxoTotal = utxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);
  // Sum of current UTXOs is current state, so the supply-cap sanity check
  // applies (each addend was already individually capped, but a defensive
  // check on the sum costs nothing and catches any summation mistake).
  if (utxoTotal > SATOSHI_SUPPLY_CAP_BIGINT) {
    throw new Error('Bitcoin UTXO total exceeds the total supply cap');
  }

  return {
    address,
    providerId,
    confirmedBalance: stats.confirmedBalance,
    unconfirmedDeltaSats: stats.unconfirmedDeltaSats,
    utxos,
    utxoTotalSats: toAtomicAmount(utxoTotal.toString(10)),
    asOf: Date.now(),
  };
}
