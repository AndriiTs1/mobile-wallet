import {
  toAtomicAmount,
  toEthereumTxHash,
  type AtomicAmount,
  type BalanceSnapshot,
  type EthereumAddress,
  type EthereumFeeQuote,
  type EthereumTxHash,
} from 'chain-domain';

import { attemptProvidersInOrder, fetchWithTimeout, type ProviderAttempt } from './provider-failover';

export type EthereumRpcProvider = {
  readonly id: string;
  readonly rpcUrl: string;
};

/**
 * Two independent, public, keyless Ethereum mainnet JSON-RPC endpoints.
 * Both verified live during Stage 4C.4 (`eth_getBalance` against the same
 * test address returned matching results from both). Provisional-for-proof
 * only, not an ADR-006 provider selection.
 *
 * Providers tried and rejected during Stage 4C research/4C.4: Cloudflare's
 * public gateway (cloudflare-eth.com) — consistently returns "Internal
 * error" on live requests; Ankr's public endpoint (rpc.ankr.com/eth) — now
 * requires an API key, no longer keyless; llamarpc (eth.llamarpc.com) —
 * returned HTTP 521 (origin down); 1rpc.io — initially returned a valid
 * result, but repeat verification showed it genuinely flaky (429 rate
 * limit revealing it's proxied through OnFinality, an inconsistent 301,
 * and a 503 across successive live calls within the same testing session)
 * — rejected as an unreliable fallback despite being keyless. meowrpc.com
 * also rate-limited (429) after a single successful call. `eth.drpc.org`
 * was the only candidate that returned a consistent 200 with a matching
 * result across repeated live calls.
 */
const ETHEREUM_PROVIDERS: readonly EthereumRpcProvider[] = [
  { id: 'publicnode', rpcUrl: 'https://ethereum-rpc.publicnode.com' },
  { id: 'drpc', rpcUrl: 'https://eth.drpc.org' },
];

const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;

async function callEthGetBalance(rpcUrl: string, address: EthereumAddress): Promise<string> {
  let response: Response;
  try {
    response = await fetchWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    });
  } catch (error) {
    throw new Error(`Failed to reach Ethereum RPC endpoint: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`Ethereum RPC request failed with status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Ethereum RPC response was not valid JSON');
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Ethereum RPC response was not a JSON object');
  }
  const body = payload as Record<string, unknown>;

  if (body.error) {
    const err = body.error as Record<string, unknown>;
    throw new Error(`Ethereum RPC returned an error: ${String(err.message ?? 'unknown error')}`);
  }

  const result = body.result;
  if (typeof result !== 'string' || !HEX_QUANTITY_PATTERN.test(result)) {
    throw new Error(
      `Ethereum RPC returned an unexpected eth_getBalance result: ${JSON.stringify(result)}`,
    );
  }

  return result;
}

/**
 * Converts a JSON-RPC hex wei quantity into an exact `AtomicAmount`. Uses
 * `BigInt` only as an internal step — the value is immediately serialized
 * back to a base-10 string; it never passes through `Number()` or any
 * floating-point representation.
 */
function hexWeiToAtomicAmount(hexWei: string): AtomicAmount {
  const wei = BigInt(hexWei);
  return toAtomicAmount(wei.toString(10));
}

export type EthereumBalanceProofResult = {
  readonly snapshot: BalanceSnapshot;
  /** Which provider actually served this result — infrastructure/
   * diagnostic metadata. Deliberately NOT part of chain-domain's
   * `BalanceSnapshot`: provider identity is not blockchain domain data. */
  readonly providerId: string;
};

/**
 * Fetches the native ETH balance for a public Ethereum mainnet address via
 * direct-device JSON-RPC (Stage 4C: direct-device access for core wallet
 * reads). Read-only — no key material is involved, and none is required:
 * `eth_getBalance` accepts any address as a public query parameter.
 *
 * Tries `providers` in order, stopping at the first success (Stage 4C.4:
 * sequential-only, never parallel, to avoid exposing the address to more
 * providers than necessary). Both providers go through this exact same
 * request/parsing/validation logic — nothing is duplicated per provider.
 */
export async function fetchEthMainnetBalance(
  address: EthereumAddress,
  providers: readonly EthereumRpcProvider[] = ETHEREUM_PROVIDERS,
): Promise<EthereumBalanceProofResult> {
  const attempts: ProviderAttempt<BalanceSnapshot>[] = providers.map((provider) => ({
    id: provider.id,
    run: async () => {
      const hexWei = await callEthGetBalance(provider.rpcUrl, address);
      return {
        assetId: { kind: 'native', chainId: 'ethereum:mainnet' },
        amount: hexWeiToAtomicAmount(hexWei),
        asOf: Date.now(),
      };
    },
  }));

  const { result, providerId } = await attemptProvidersInOrder(attempts);
  return { snapshot: result, providerId };
}

// ============================================================================
// Stage 5G.2.1 — Send-preparation RPC capabilities (nonce, fee data,
// broadcast, transaction lookup). Everything above this line (providers,
// fetchEthMainnetBalance) is Stage 4C.2/4C.4 and is deliberately left
// untouched — the new capabilities below reuse its provider list, timeout
// mechanism (`fetchWithTimeout`), and sequential-failover helper
// (`attemptProvidersInOrder`) exactly as-is, rather than introducing a
// second provider list or a second failover mechanism.
// ============================================================================

/**
 * The RPC node received and understood the request but explicitly rejected
 * it (e.g. underpriced, nonce too low, insufficient funds, malformed
 * transaction). This is a DEFINITIVE outcome for a read; for a broadcast
 * specifically, it still means the node did not accept these bytes —
 * see `broadcastEthMainnetRawTransaction`'s own doc comment for why a
 * rejection is nonetheless not treated as 100% proof of non-inclusion
 * (the recommended caller pattern is to verify via
 * `lookupEthMainnetTransaction` using the already-known local hash before
 * concluding a Send definitely failed).
 */
export class EthereumRpcRejectionError extends Error {
  readonly rpcErrorCode: number | undefined;

  constructor(message: string, rpcErrorCode?: number) {
    super(message);
    this.name = 'EthereumRpcRejectionError';
    this.rpcErrorCode = rpcErrorCode;
  }
}

/**
 * The request could not be completed at the transport level — network
 * failure, timeout, unreachable endpoint, or a malformed/non-JSON-RPC-
 * shaped response. Distinct from `EthereumRpcRejectionError`: the node
 * never gave a definitive answer at all. For a broadcast, this is the
 * AMBIGUOUS case the task's "AMBIGUOUS BROADCAST REQUIREMENT" describes —
 * the transaction may or may not have been accepted before the transport
 * failed.
 */
export class EthereumRpcTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EthereumRpcTransportError';
  }
}

const HEX_QUANTITY_PATTERN_V2 = /^0x[0-9a-fA-F]+$/;

/**
 * Structural validation for any raw JSON-RPC hex-quantity result. Shared by
 * every new capability below — the single place that decides "is this
 * string even shaped like a hex quantity," fully independent of the
 * existing, untouched `HEX_QUANTITY_PATTERN`/inline check
 * `fetchEthMainnetBalance` already uses (deliberately not retrofitted to
 * share this helper — see this file's Stage 5G.2.1 header comment: zero
 * risk of changing already-verified balance behavior).
 */
function assertHexQuantity(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !HEX_QUANTITY_PATTERN_V2.test(value)) {
    throw new Error(`Invalid hex quantity for "${fieldName}": ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * The one shared JSON-RPC request/response envelope every new capability
 * below is built on: POST the request, treat any network-level failure as
 * `EthereumRpcTransportError`, treat any `{error: ...}` JSON-RPC-level
 * response as `EthereumRpcRejectionError`, and return `result` untouched
 * (each caller validates its own expected shape) otherwise. This is the
 * "error normalization" the task asks to reuse — factored out once here
 * rather than duplicated per new method, but deliberately NOT retrofitted
 * onto the existing, untouched `callEthGetBalance` (same reasoning as
 * `assertHexQuantity` above).
 */
async function callEthereumJsonRpc(
  rpcUrl: string,
  method: string,
  params: readonly unknown[],
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  } catch (error) {
    throw new EthereumRpcTransportError(`Failed to reach Ethereum RPC endpoint: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new EthereumRpcTransportError(`Ethereum RPC request failed with status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new EthereumRpcTransportError('Ethereum RPC response was not valid JSON');
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new EthereumRpcTransportError('Ethereum RPC response was not a JSON object');
  }
  const body = payload as Record<string, unknown>;

  if (body.error) {
    const err = body.error as Record<string, unknown>;
    const code = typeof err.code === 'number' ? err.code : undefined;
    throw new EthereumRpcRejectionError(String(err.message ?? 'unknown error'), code);
  }

  return body.result;
}

// ----------------------------------------------------------------------------
// A. Pending nonce
// ----------------------------------------------------------------------------

export type EthereumNonceResult = {
  readonly nonce: number;
  readonly providerId: string;
};

/**
 * Converts a validated hex quantity into a safe non-negative integer nonce.
 * `BigInt` is used only as an internal overflow-safe check — the return
 * type is `number`, matching `EthereumV1TransactionIntent.nonce`'s existing
 * `number` field (Stage 5G.1): a real account nonce never approaches
 * `Number.MAX_SAFE_INTEGER`, so `number` is the correct, already-established
 * representation for this specific field (unlike wei-denominated amounts,
 * which stay string-encoded throughout this codebase).
 */
function hexQuantityToSafeNonce(hexQuantity: string): number {
  const value = BigInt(hexQuantity);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`eth_getTransactionCount returned a nonce outside the safe integer range: ${hexQuantity}`);
  }
  return Number(value);
}

/**
 * Fetches the PENDING nonce for `address` — `eth_getTransactionCount`'s
 * second parameter is always the literal `"pending"`, never `"latest"` and
 * never a caller-suppliable override: a previously broadcast but
 * not-yet-mined transaction from this same wallet must participate in
 * nonce selection, or a second Send attempt would reuse an already-used
 * nonce. There is no silent fallback to `"latest"` anywhere in this
 * function — if `"pending"` is unsupported or fails, the whole call fails
 * (surfacing as an ordinary provider-attempt failure/failover), it never
 * silently substitutes a different tag.
 *
 * Sequential-only provider failover, reusing the exact existing
 * `ETHEREUM_PROVIDERS` list and `attemptProvidersInOrder` — same posture as
 * `fetchEthMainnetBalance`: this is a read, so trying a second provider on
 * the first's failure is the already-established, safe pattern.
 */
export async function fetchEthMainnetPendingNonce(
  address: EthereumAddress,
  providers: readonly EthereumRpcProvider[] = ETHEREUM_PROVIDERS,
): Promise<EthereumNonceResult> {
  const attempts: ProviderAttempt<number>[] = providers.map((provider) => ({
    id: provider.id,
    run: async () => {
      const result = await callEthereumJsonRpc(provider.rpcUrl, 'eth_getTransactionCount', [
        address,
        'pending',
      ]);
      const hexQuantity = assertHexQuantity(result, 'eth_getTransactionCount (pending) result');
      return hexQuantityToSafeNonce(hexQuantity);
    },
  }));

  const { result, providerId } = await attemptProvidersInOrder(attempts);
  return { nonce: result, providerId };
}

// ----------------------------------------------------------------------------
// B. EIP-1559 fee data
// ----------------------------------------------------------------------------

export type EthereumFeeDataResult = {
  readonly feeQuote: EthereumFeeQuote;
  readonly providerId: string;
};

/**
 * `eth_feeHistory(1, "latest", [50])` — ONE JSON-RPC call, chosen instead
 * of the two-call `eth_getBlockByNumber` + `eth_maxPriorityFeePerGas`
 * combination: `eth_feeHistory` is part of the EIP-1559 specification
 * itself (not a client-specific convenience method the way
 * `eth_maxPriorityFeePerGas` is — that one is a Geth-originated shorthand
 * with no formal spec guarantee), and its single response already carries
 * both values this function needs:
 *
 * - `baseFeePerGas` is an array of `blockCount + 1` entries: entries
 *   `0..blockCount-1` are the actual historical blocks' base fees, and the
 *   LAST entry is always the network's own EIP-1559 projection for the
 *   block immediately following the newest one returned — this holds
 *   regardless of how many historical blocks were actually returned, per
 *   spec. For the exact `blockCount=1` request made here, that means
 *   `baseFeePerGas.length === 2` and the projection lives at index `1` —
 *   read via `array[array.length - 1]`, not a hardcoded `[1]`, so a
 *   provider that (non-conformantly) returned more entries than requested
 *   would fail the exact-length check below rather than silently having
 *   its last entry misread as something else.
 * - `reward` is an array of `blockCount` entries (one per returned
 *   historical block), each itself an array of one value per requested
 *   percentile. For `blockCount=1`, `reward.length === 1`, and its sole
 *   entry's percentile-50 value is the median priority fee actually paid
 *   in that one block — a standard, widely used estimate for
 *   `maxPriorityFeePerGas` (the same technique ethers.js's `getFeeData()`
 *   and most mainstream wallets use). Read from the LAST block entry
 *   (`reward[reward.length - 1]`), symmetric with `baseFeePerGas` above,
 *   rather than a hardcoded `[0]`.
 * - The EIP-1559-defined relationship `baseFeePerGas.length === reward.length + 1`
 *   is checked explicitly; since exactly one block was requested, the
 *   response is additionally required to match that exact expected shape
 *   (`baseFeePerGas.length === 2`, `reward.length === 1`) — a provider
 *   returning history for a different number of blocks than requested is
 *   treated as malformed, never silently accepted or reinterpreted.
 *
 * Live-verified against both configured providers before implementing this
 * (2026-08-20): both `ethereum-rpc.publicnode.com` and `eth.drpc.org`
 * returned a well-formed `{baseFeePerGas: [...], reward: [[...]], ...}`
 * shape for this exact request — not assumed from documentation alone.
 */
async function callEthFeeHistory(
  rpcUrl: string,
): Promise<{ baseFeePerGasWei: bigint; maxPriorityFeePerGasWei: bigint }> {
  const result = await callEthereumJsonRpc(rpcUrl, 'eth_feeHistory', ['0x1', 'latest', [50]]);
  if (typeof result !== 'object' || result === null) {
    throw new Error('eth_feeHistory response was not a JSON object');
  }
  const body = result as Record<string, unknown>;

  const baseFeePerGasArray = body.baseFeePerGas;
  const rewardArray = body.reward;

  if (!Array.isArray(baseFeePerGasArray) || !Array.isArray(rewardArray)) {
    throw new Error('eth_feeHistory response baseFeePerGas/reward were not both arrays');
  }

  // EIP-1559-defined relationship between the two arrays' lengths.
  if (baseFeePerGasArray.length !== rewardArray.length + 1) {
    throw new Error(
      `eth_feeHistory response shape violates the required baseFeePerGas.length === reward.length + 1 relationship (got ${baseFeePerGasArray.length} and ${rewardArray.length})`,
    );
  }

  // Exactly one block was requested ("0x1") — require the response to
  // match that exact shape, not merely "at least" it. A provider that
  // ignored blockCount and returned history for a different number of
  // blocks is treated as malformed, never silently reinterpreted.
  if (baseFeePerGasArray.length !== 2 || rewardArray.length !== 1) {
    throw new Error(
      `eth_feeHistory response does not match the requested one-block history (got baseFeePerGas.length=${baseFeePerGasArray.length}, reward.length=${rewardArray.length})`,
    );
  }

  const projectedBaseFeeHex = assertHexQuantity(
    baseFeePerGasArray[baseFeePerGasArray.length - 1],
    'eth_feeHistory baseFeePerGas (final/projected entry)',
  );

  const lastRewardBlock = rewardArray[rewardArray.length - 1];
  if (!Array.isArray(lastRewardBlock) || lastRewardBlock.length < 1) {
    throw new Error('eth_feeHistory response is missing the requested reward percentile');
  }
  const priorityFeeHex = assertHexQuantity(
    lastRewardBlock[0],
    'eth_feeHistory reward (final block, requested percentile)',
  );

  return {
    baseFeePerGasWei: BigInt(projectedBaseFeeHex),
    maxPriorityFeePerGasWei: BigInt(priorityFeeHex),
  };
}

/**
 * Fetches EIP-1559 fee data for a native ETH V1 Send. `maxFeePerGasWei` is
 * computed as `(projected base fee * 2) + maxPriorityFeePerGasWei` — the
 * standard "2x base fee" heuristic (the same one ethers.js/MetaMask use):
 * EIP-1559 limits each block's base-fee increase to at most 12.5% over the
 * previous block, so a 2x multiple gives headroom across several
 * consecutive full blocks before the fee ceiling would need to be raised.
 * This is a documented, widely-used technique, not an arbitrary constant.
 * All arithmetic is `BigInt`; wei values are serialized to `AtomicAmount`
 * decimal strings only at the very end, matching this codebase's
 * established amount-representation convention throughout — never routed
 * through a floating-point/`Number` representation at any intermediate
 * step. `chainId` is always the fixed literal `'ethereum:mainnet'`, never
 * derived from any RPC response (see this file's own network-consistency
 * note further down).
 */
export async function fetchEthMainnetFeeData(
  providers: readonly EthereumRpcProvider[] = ETHEREUM_PROVIDERS,
): Promise<EthereumFeeDataResult> {
  const attempts: ProviderAttempt<{ baseFeePerGasWei: bigint; maxPriorityFeePerGasWei: bigint }>[] =
    providers.map((provider) => ({
      id: provider.id,
      run: () => callEthFeeHistory(provider.rpcUrl),
    }));

  const { result, providerId } = await attemptProvidersInOrder(attempts);
  const maxFeePerGasWei = result.baseFeePerGasWei * 2n + result.maxPriorityFeePerGasWei;

  return {
    feeQuote: {
      chainId: 'ethereum:mainnet',
      maxFeePerGasWei: toAtomicAmount(maxFeePerGasWei.toString(10)),
      maxPriorityFeePerGasWei: toAtomicAmount(result.maxPriorityFeePerGasWei.toString(10)),
      asOf: Date.now(),
    },
    providerId,
  };
}

// ----------------------------------------------------------------------------
// C. Broadcast
// ----------------------------------------------------------------------------

export type EthereumBroadcastResult =
  | { readonly outcome: 'accepted'; readonly txHash: EthereumTxHash; readonly providerId: string }
  | { readonly outcome: 'rejected'; readonly reason: string; readonly providerId: string }
  | { readonly outcome: 'ambiguous'; readonly reason: string; readonly providerId: string };

/**
 * Broadcasts an already-signed transaction — the ONLY thing this function
 * accepts is `signedTxHex` itself (the exact bytes Stage 5G.1's
 * `signEthereumTransactionV1` produced) plus the `expectedTxHash` that same
 * signing call already returned. It never constructs, modifies, or
 * re-derives a transaction; it never touches a nonce, fee, or any other
 * intent field; no secret/signing material is accepted, held, or could
 * possibly be logged by this function — it never sees any.
 *
 * DELIBERATELY queries exactly ONE provider — no automatic failover to a
 * second provider inside this primitive, unlike every read above. This is
 * an intentional divergence from the read-only pattern; see this file's
 * own security-review note and the Stage 5G.2.1 report's §L for the full
 * reasoning: while resubmitting identical already-signed bytes to a second
 * provider is arguably safe in isolation (idempotent — never a second,
 * differently-hashed transaction), automatically doing so inside this one
 * primitive would blur the three-outcome contract the future Send
 * coordinator depends on. Whether to ever attempt a second provider after
 * an ambiguous outcome is left as an explicit, visible decision for that
 * coordinator to make — never an automatic behavior hidden in here.
 *
 * Returns one of exactly three outcomes, never throws for an ordinary
 * RPC-level condition (only a genuine programming/validation error, e.g. a
 * malformed `signedTxHex`, throws):
 * - `'accepted'` — the provider returned a transaction hash, and it
 *   matches `expectedTxHash` exactly (a structural safety net: two
 *   correctly-functioning nodes given identical signed bytes can only ever
 *   compute the identical hash — any mismatch is treated as an anomaly,
 *   not trusted).
 * - `'rejected'` — the provider understood the request and explicitly
 *   declined it (JSON-RPC `error` response) — a DEFINITIVE outcome for
 *   this specific attempt. Even so, the recommended caller pattern (not
 *   automated here) is to still verify via `lookupEthMainnetTransaction`
 *   using `expectedTxHash` before concluding the Send failed entirely —
 *   some rejection reasons (e.g. "already known") actually indicate the
 *   transaction was already accepted by an earlier attempt.
 * - `'ambiguous'` — a transport-level failure (timeout, network error,
 *   malformed response) occurred; whether the provider's mempool actually
 *   received these bytes before the failure is genuinely unknown. This is
 *   the case the task's "AMBIGUOUS BROADCAST REQUIREMENT" describes — the
 *   caller must resolve it via `lookupEthMainnetTransaction`, never by
 *   re-signing or picking a new nonce.
 *
 * No automatic retry of any kind exists inside this function.
 */
export async function broadcastEthMainnetRawTransaction(
  signedTxHex: string,
  expectedTxHash: EthereumTxHash,
  provider: EthereumRpcProvider = ETHEREUM_PROVIDERS[0],
): Promise<EthereumBroadcastResult> {
  // Only the RPC call itself can produce an 'ambiguous' outcome — a
  // transport-level failure means we genuinely don't know whether the
  // provider received these bytes. Everything after a successful call
  // returns a DEFINITIVE answer from a provider that did respond, so any
  // failure to interpret that answer (malformed shape, wrong length,
  // mismatch) is always 'rejected', never 'ambiguous' — there is no
  // question of whether the provider answered, only whether its answer
  // was valid.
  let result: unknown;
  try {
    result = await callEthereumJsonRpc(provider.rpcUrl, 'eth_sendRawTransaction', [signedTxHex]);
  } catch (error) {
    if (error instanceof EthereumRpcRejectionError) {
      return { outcome: 'rejected', reason: error.message, providerId: provider.id };
    }
    // EthereumRpcTransportError, or any other unexpected transport-level
    // failure — never a definitive rejection and never silently swallowed.
    return { outcome: 'ambiguous', reason: (error as Error).message, providerId: provider.id };
  }

  let hexHash: string;
  try {
    hexHash = assertHexQuantity(result, 'eth_sendRawTransaction result');
  } catch {
    return {
      outcome: 'rejected',
      reason: `provider returned a malformed transaction hash result: ${JSON.stringify(result)}`,
      providerId: provider.id,
    };
  }

  let txHash: EthereumTxHash;
  try {
    txHash = toEthereumTxHash(hexHash);
  } catch {
    return { outcome: 'rejected', reason: `provider returned a malformed transaction hash: ${hexHash}`, providerId: provider.id };
  }

  // Stage 5G.2.4: case-insensitive — both sides are already format-validated
  // 0x-prefixed 64-hex-char strings (`toEthereumTxHash`), and hex-digit case
  // carries no value; a provider or the signer using a different case for
  // the identical hash must never be treated as a mismatch.
  if (txHash.toLowerCase() !== expectedTxHash.toLowerCase()) {
    return {
      outcome: 'rejected',
      reason: 'provider returned a transaction hash that does not match the locally signed transaction',
      providerId: provider.id,
    };
  }
  return { outcome: 'accepted', txHash, providerId: provider.id };
}

// ----------------------------------------------------------------------------
// D. Transaction / receipt lookup
// ----------------------------------------------------------------------------

export type EthereumTransactionLookupResult =
  | { readonly status: 'not_found' }
  | { readonly status: 'pending' }
  | { readonly status: 'confirmed'; readonly blockNumber: number; readonly success: boolean };

function assertQuantityOrNull(value: unknown, fieldName: string): string | null {
  if (value === null) return null;
  return assertHexQuantity(value, fieldName);
}

/**
 * Resolves the current status of a previously broadcast transaction, given
 * only its hash — this is the mechanism the future Send coordinator uses
 * to resolve an `'ambiguous'`/`'rejected'` broadcast outcome, or to confirm
 * an `'accepted'` one actually landed. Not transaction-history UI: the
 * returned shape is deliberately minimal (status + the two fields needed
 * to know whether the Send ultimately succeeded), not a general transaction
 * explorer payload.
 *
 * Checks `eth_getTransactionReceipt` first (present only once mined); if
 * that is `null`, falls back to `eth_getTransactionByHash` to distinguish
 * "known to the network but not yet mined" (`'pending'`) from "not known to
 * this provider at all" (`'not_found'`) — verified live against both
 * configured providers: a not-found hash returns `{"result": null}` for
 * both methods, never a JSON-RPC error, so `null` is treated as a valid,
 * expected "not found (yet)" result, not a failure to fail over from.
 *
 * `'not_found'` is NOT proof a Send never happened — the transaction may
 * simply not have propagated to this specific provider's view yet
 * (especially soon after an ambiguous broadcast outcome). Callers should
 * poll, not treat a single `'not_found'` result as final.
 */
export async function lookupEthMainnetTransaction(
  txHash: EthereumTxHash,
  providers: readonly EthereumRpcProvider[] = ETHEREUM_PROVIDERS,
): Promise<{ result: EthereumTransactionLookupResult; providerId: string }> {
  const attempts: ProviderAttempt<EthereumTransactionLookupResult>[] = providers.map((provider) => ({
    id: provider.id,
    run: async () => {
      const receipt = await callEthereumJsonRpc(provider.rpcUrl, 'eth_getTransactionReceipt', [txHash]);
      if (receipt !== null) {
        if (typeof receipt !== 'object') {
          throw new Error('eth_getTransactionReceipt returned a non-null, non-object result');
        }
        const body = receipt as Record<string, unknown>;
        const blockNumberHex = assertHexQuantity(body.blockNumber, 'receipt.blockNumber');
        const statusHex = assertQuantityOrNull(body.status, 'receipt.status');
        const blockNumber = hexQuantityToSafeNonce(blockNumberHex);
        // A missing `status` field (pre-Byzantium semantics) never applies
        // to current mainnet; treat that case as a malformed receipt
        // rather than guessing success/failure.
        if (statusHex === null) {
          throw new Error('eth_getTransactionReceipt returned a receipt with no status field');
        }
        return { status: 'confirmed', blockNumber, success: statusHex === '0x1' };
      }

      const transaction = await callEthereumJsonRpc(provider.rpcUrl, 'eth_getTransactionByHash', [txHash]);
      if (transaction === null) {
        return { status: 'not_found' };
      }
      if (typeof transaction !== 'object') {
        throw new Error('eth_getTransactionByHash returned a non-null, non-object result');
      }
      return { status: 'pending' };
    },
  }));

  const { result, providerId } = await attemptProvidersInOrder(attempts);
  return { result, providerId };
}
