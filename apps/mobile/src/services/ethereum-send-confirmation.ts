// ============================================================================
// Stage 5G.2.4 — Ethereum V1 Confirm, authenticated signing & broadcast.
//
// The ONLY new orchestration this stage adds: drive an already-prepared,
// already-reviewed `EthereumV1PreparedSend` snapshot (Stage 5G.2.2/5G.2.3)
// through the EXISTING authenticated native signer (Stage 5G.1's
// `signEthereumTransactionV1` — every call is a FRESH device-owner
// authentication; see that function's own doc comment in
// `wallet-core-bridge.ts` and `WalletNativeEthereumTransactionSigner.swift`,
// neither of which this file modifies) and the EXISTING broadcast
// primitive (Stage 5G.2.1's `broadcastEthMainnetRawTransaction`, also
// unmodified in behavior — only its hash comparison was hardened to be
// case-insensitive). No second signer, no second broadcaster.
//
// TOCTOU guarantee: this file NEVER re-fetches recipient/amount/nonce/gas/
// fees/chainId/data. `toEthereumV1TransactionIntent` (Stage 5G.2.2) is a
// pure, lossless reshape of the exact snapshot the user already reviewed —
// nothing here recomputes any of it. If that snapshot is stale, the only
// correct fix is an explicit Back-to-Edit -> re-prepare -> new Review,
// never a silent refresh inside this pipeline.
// ============================================================================

import { toEthereumTxHash, type EthereumTxHash } from 'chain-domain';

import { toEthereumV1TransactionIntent, type EthereumV1PreparedSend } from './ethereum-send-preparation';
import { broadcastEthMainnetRawTransaction } from './ethereum-rpc';
import { signEthereumTransactionV1 } from './wallet-core-bridge';

export type EthereumSendConfirmationErrorReason =
  | 'auth_or_signing_failed'
  | 'broadcast_rejected'
  | 'broadcast_ambiguous'
  | 'hash_mismatch';

/**
 * The one error type this module ever throws. Mirrors
 * `EthereumSendPreparationError`'s discipline: a `reason` code plus a
 * generic, non-descriptive message — never a native error string, RPC URL,
 * provider payload, or any signing/key/authentication detail.
 */
export class EthereumSendConfirmationError extends Error {
  readonly reason: EthereumSendConfirmationErrorReason;

  constructor(reason: EthereumSendConfirmationErrorReason, message: string) {
    super(message);
    this.name = 'EthereumSendConfirmationError';
    this.reason = reason;
  }
}

/** The two phases a caller may want to reflect in UI — signing (which
 * includes the native authentication prompt) and broadcasting. Purely
 * informational: nothing about the pipeline's own control flow depends on
 * whether a caller observes this. */
export type EthereumSendConfirmationPhase = 'signing' | 'broadcasting';

type ConfirmDependencies = {
  readonly sign?: typeof signEthereumTransactionV1;
  readonly broadcast?: typeof broadcastEthMainnetRawTransaction;
  readonly onPhaseChange?: (phase: EthereumSendConfirmationPhase) => void;
};

/**
 * Signs and broadcasts EXACTLY the reviewed `prepared` snapshot — the ONE
 * production entry point Stage 5G.2.4 adds. `deps` exists solely so this
 * pure orchestration can be exercised with fakes in permanent tests (the
 * same optional-dependency-injection pattern `fetchEthMainnetBalance`
 * already uses for its `providers` parameter); production callers
 * (`send-review.tsx`) never pass it, so production always uses the real
 * native signer and the real broadcast primitive.
 *
 * Fixed, single pass — no loop, no automatic retry, no second broadcast
 * attempt of any kind:
 *   1. `toEthereumV1TransactionIntent(prepared)` — pure reshape, recomputes
 *      nothing.
 *   2. `sign(intent)` — the existing authenticated native signer. A FRESH
 *      device-owner authentication on every call (Stage 5G.1's own
 *      guarantee, unchanged); this function neither caches nor bypasses
 *      that, and never receives a mnemonic/entropy/seed/private key itself
 *      — only the signed hex and its hash come back.
 *   3. On successful signing: EXACTLY ONE `broadcast(...)` call, given
 *      exactly `signed.signedTxHex` and the signer's own hash — never a
 *      recomputed/re-derived transaction, never a second attempt.
 *   4. Defense-in-depth hash check: even though `broadcast(...)` already
 *      only ever returns `'accepted'` when the provider's returned hash
 *      structurally matches the hash passed to it (case-insensitively),
 *      this function performs an independent comparison of its own before
 *      ever resolving successfully — a transaction hash is never trusted
 *      from a single source alone before reporting success to the caller.
 *
 * Resolves with the confirmed `EthereumTxHash` on success. Every other
 * outcome — authentication/signing failure, a definite broadcast
 * rejection, an ambiguous transport-level broadcast failure, or a hash
 * mismatch — rejects with `EthereumSendConfirmationError`, never partially
 * resolves, never fabricates a hash.
 */
export async function confirmAndSendEthereumV1(
  prepared: EthereumV1PreparedSend,
  deps: ConfirmDependencies = {},
): Promise<EthereumTxHash> {
  const sign = deps.sign ?? signEthereumTransactionV1;
  const broadcast = deps.broadcast ?? broadcastEthMainnetRawTransaction;

  let signed: Awaited<ReturnType<typeof signEthereumTransactionV1>>;
  try {
    deps.onPhaseChange?.('signing');
    signed = await sign(toEthereumV1TransactionIntent(prepared));
  } catch {
    // Covers authentication cancellation/failure AND any signing-layer
    // failure alike — Stage 5G.1's `signEthereumTransactionV1` already
    // collapses both into one generic rejection at the native boundary.
    // Never a native error message, never any secret/key/authentication
    // detail crosses here.
    throw new EthereumSendConfirmationError(
      'auth_or_signing_failed',
      'Authentication was cancelled or signing failed. Please try again.',
    );
  }

  let signerTxHash: EthereumTxHash;
  try {
    signerTxHash = toEthereumTxHash(signed.txHashHex);
  } catch {
    // Structurally shouldn't happen — the native signer always returns a
    // well-formed hash (see `WalletNativeEthereumTransactionSigner.swift`)
    // — but this boundary never trusts it blindly either, and a broadcast
    // is never attempted with an unvalidated hash.
    throw new EthereumSendConfirmationError(
      'hash_mismatch',
      'Something went wrong confirming this transaction. Please try again.',
    );
  }

  deps.onPhaseChange?.('broadcasting');
  const broadcastResult = await broadcast(signed.signedTxHex, signerTxHash);

  if (broadcastResult.outcome === 'ambiguous') {
    // The node may have accepted the transaction even though this client
    // never received a definitive response — never treated as safe to
    // silently retry/rebroadcast from here. The caller (Review's confirm
    // state machine) must not offer an immediate one-tap retry for this
    // outcome.
    throw new EthereumSendConfirmationError(
      'broadcast_ambiguous',
      'Transaction status is uncertain. Please wait before trying again.',
    );
  }
  if (broadcastResult.outcome === 'rejected') {
    throw new EthereumSendConfirmationError(
      'broadcast_rejected',
      'The transaction was not accepted by the network. Please try again.',
    );
  }

  if (broadcastResult.txHash.toLowerCase() !== signerTxHash.toLowerCase()) {
    throw new EthereumSendConfirmationError(
      'hash_mismatch',
      'Something went wrong confirming this transaction. Please try again.',
    );
  }

  return broadcastResult.txHash;
}
