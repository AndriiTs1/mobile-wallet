// ============================================================================
// Stage 5G.2.5 — Ethereum V1 Send status resolution after broadcast.
//
// Resolves the post-broadcast lifecycle (pending -> confirmed/failed, or
// uncertain) using ONLY the already-broadcast transaction's own
// locally-known hash and the EXISTING read-only lookup primitive (Stage
// 5G.2.1's `lookupEthMainnetTransaction`, reused verbatim — not modified,
// not duplicated). This file NEVER signs and NEVER broadcasts — it exists
// specifically so an ambiguous broadcast outcome, or a manual "Check
// status" tap, can be resolved without re-signing or constructing a new
// transaction. No provider-specific status parsing is invented here: every
// branch below maps directly from a value `lookupEthMainnetTransaction`
// itself already produces.
// ============================================================================

import type { EthereumTxHash } from 'chain-domain';

import { lookupEthMainnetTransaction, type EthereumTransactionLookupResult } from './ethereum-rpc';

/**
 * The smallest explicit post-broadcast status vocabulary V1 needs:
 * - `pending` — known to the network, not yet mined (or a broadcast that
 *   was itself definitively accepted, before any lookup has happened at
 *   all — see `ethereum-send-confirmation.ts`'s successful-return path).
 * - `confirmed` — mined, and the receipt's own status is success.
 * - `failed` — mined but the receipt's own status is failure (reverted) —
 *   or the broadcast itself was definitively rejected before ever reaching
 *   a mempool (`broadcast_rejected`; no lookup applies there — see this
 *   stage's report §E).
 * - `uncertain` — genuinely unknown: an ambiguous broadcast (or a
 *   defense-in-depth hash-mismatch anomaly) whose lookup came back
 *   `not_found`. NOT proof of failure — the transaction may simply not
 *   have propagated to the queried provider's view yet.
 */
export type EthereumSendStatus = 'pending' | 'confirmed' | 'failed' | 'uncertain';

/**
 * Pure mapping from the existing, already-safe `EthereumTransactionLookupResult`
 * to this stage's UI status vocabulary.
 */
export function interpretEthereumTransactionLookup(
  result: EthereumTransactionLookupResult,
): EthereumSendStatus {
  switch (result.status) {
    case 'pending':
      return 'pending';
    case 'confirmed':
      return result.success ? 'confirmed' : 'failed';
    case 'not_found':
      return 'uncertain';
  }
}

type StatusCheckDependencies = {
  readonly lookup?: typeof lookupEthMainnetTransaction;
};

/**
 * Resolves the current status of an already-broadcast transaction, given
 * only its locally-known hash. Used both for the one-shot automatic
 * resolution right after an ambiguous/hash-mismatch broadcast outcome, and
 * for the user-triggered "Check status" action on an already-`pending`/
 * `uncertain` screen — the exact same code path either way, never a second
 * implementation. `deps` exists solely for permanent tests to inject a fake
 * `lookup` (the same pattern `confirmAndSendEthereumV1` already
 * establishes); production callers never pass it.
 *
 * Structurally incapable of signing or broadcasting — the only import this
 * file has from `ethereum-rpc.ts` is the read-only lookup function itself.
 * If every provider's lookup attempt fails at the transport level, this
 * rejects (never fabricates a definitive status); callers should treat
 * that identically to an inconclusive check, not a failure.
 */
export async function checkEthereumSendStatus(
  txHash: EthereumTxHash,
  deps: StatusCheckDependencies = {},
): Promise<EthereumSendStatus> {
  const lookup = deps.lookup ?? lookupEthMainnetTransaction;
  const { result } = await lookup(txHash);
  return interpretEthereumTransactionLookup(result);
}
