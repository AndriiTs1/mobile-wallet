// ============================================================================
// Stage 5G.2.2 — Ethereum V1 native ETH Send transaction preparation.
//
// Produces an immutable, review-ready snapshot of a native ETH transfer:
// recipient + amount validated, pending nonce and EIP-1559 fee data read
// from the existing Stage 5G.2.1 RPC layer, and balance affordability
// checked against amount + MAXIMUM possible fee (never amount alone).
//
// This file deliberately stops at the prepared snapshot. It never signs
// (Stage 5G.1's `signEthereumTransactionV1`) and never broadcasts (Stage
// 5G.2.1's `broadcastEthMainnetRawTransaction`) — both remain the future
// Review stage's responsibility, using `toEthereumV1TransactionIntent`
// below to convert this snapshot into the exact intent shape signing
// already expects, without recomputing anything the user reviewed.
// ============================================================================

import {
  toAtomicAmount,
  toEthereumAddress,
  parseEthDecimalStringToWei,
  type AtomicAmount,
  type EthereumAddress,
  type EthereumFeeQuote,
} from 'chain-domain';

import {
  fetchEthMainnetBalance,
  fetchEthMainnetPendingNonce,
  fetchEthMainnetFeeData,
  EthereumRpcRejectionError,
  EthereumRpcTransportError,
} from './ethereum-rpc';
import { getEthereumAddressV1, type EthereumV1TransactionIntent } from './wallet-core-bridge';

/**
 * Fixed EIP-155 numeric chain id for Ethereum mainnet — never derived from
 * an RPC response, never accepted from a caller/UI. This is the same fixed
 * network `ethereum-rpc.ts`'s provider list and `chain-domain`'s
 * `'ethereum:mainnet'` domain chain id both already assume; this constant
 * exists because `EthereumV1TransactionIntent.chainId` (Stage 5G.1) needs
 * the numeric EIP-155 form specifically, which is a signing-protocol detail
 * `chain-domain`'s string `ChainId` deliberately does not carry.
 */
const ETHEREUM_MAINNET_EVM_CHAIN_ID = 1;

/**
 * Intrinsic gas cost of a plain ETH transfer per the Ethereum protocol
 * (21000 gas: the base transaction cost with no calldata and no contract
 * execution). Safe ONLY because this stage is scoped to a plain native ETH
 * transfer with `dataHex === '0x'` — any non-empty calldata or contract
 * interaction would require `eth_estimateGas` instead, which this stage
 * deliberately does not add (out of scope; V1 native-ETH-only).
 */
const NATIVE_ETH_TRANSFER_GAS_LIMIT = 21000;

/** Plain ETH transfer carries no calldata. */
const NATIVE_ETH_TRANSFER_DATA_HEX = '0x';

export type EthereumSendPreparationErrorReason =
  | 'invalid_recipient'
  | 'invalid_amount'
  | 'insufficient_funds'
  | 'network_error';

/**
 * The one error type this module ever throws. Every RPC/bridge failure is
 * normalized into this shape — callers (and any future UI) never see a raw
 * provider error message, HTTP status, or JSON-RPC error payload; only a
 * `reason` code and a generic, non-descriptive message.
 */
export class EthereumSendPreparationError extends Error {
  readonly reason: EthereumSendPreparationErrorReason;

  constructor(reason: EthereumSendPreparationErrorReason, message: string) {
    super(message);
    this.name = 'EthereumSendPreparationError';
    this.reason = reason;
  }
}

/**
 * Immutable snapshot of a prepared native ETH V1 Send. Every field here is
 * public, non-secret transaction data — sufficient for a future Review
 * screen to display the recipient, amount, maximum fee, and maximum total
 * debit, AND sufficient for `toEthereumV1TransactionIntent` to build the
 * exact signing intent without recomputing or re-deriving any of the
 * user's original input. Contains no entropy, mnemonic, seed, private key,
 * or signed transaction bytes — there is no field capable of carrying one.
 *
 * This is a plain data snapshot, not a live/refreshable object: nothing in
 * this codebase mutates or re-fetches into an already-returned instance.
 * If nonce/fee data goes stale before Review, the caller must call
 * `prepareEthereumV1Send` again to get a new snapshot — see this file's
 * TOCTOU note on `prepareEthereumV1Send` for why that must stay an
 * explicit, visible re-prepare rather than a hidden refresh.
 */
export type EthereumV1PreparedSend = {
  readonly senderAddress: EthereumAddress;
  readonly recipient: EthereumAddress;
  readonly amountWei: AtomicAmount;
  readonly maxFeeWei: AtomicAmount;
  readonly totalMaxDebitWei: AtomicAmount;
  readonly nonce: number;
  readonly gasLimit: number;
  readonly maxFeePerGasWei: AtomicAmount;
  readonly maxPriorityFeePerGasWei: AtomicAmount;
  readonly chainId: number;
  readonly dataHex: '0x';
};

type EthereumV1PreparedSendInput = {
  readonly senderAddress: EthereumAddress;
  readonly recipientInput: string;
  readonly amountEthInput: string;
  readonly balanceWei: AtomicAmount;
  readonly nonce: number;
  readonly feeQuote: EthereumFeeQuote;
};

/**
 * Pure preparation core — no RPC, no I/O. Isolated from
 * `prepareEthereumV1Send` specifically so it can be exercised directly
 * (permanent structural source-audit tests below assert its shape; the
 * companion temporary scratch script this stage's report describes
 * exercises its actual arithmetic against real BigInt values before being
 * deleted).
 *
 * Self-send (recipient === senderAddress) is deliberately NOT rejected: a
 * plain ETH transfer to one's own address is a valid, well-formed
 * transaction with no distinct security risk in this V1 scope (nonce still
 * advances normally; the fee is still paid). No restriction is invented
 * here that the task/architecture does not call for.
 */
function buildEthereumV1PreparedSend(input: EthereumV1PreparedSendInput): EthereumV1PreparedSend {
  let recipient: EthereumAddress;
  try {
    recipient = toEthereumAddress(input.recipientInput);
  } catch {
    throw new EthereumSendPreparationError(
      'invalid_recipient',
      'The recipient address is not a valid Ethereum address.',
    );
  }

  let amountWeiBigInt: bigint;
  try {
    amountWeiBigInt = BigInt(parseEthDecimalStringToWei(input.amountEthInput));
  } catch {
    throw new EthereumSendPreparationError(
      'invalid_amount',
      'The ETH amount is not a valid, positive decimal value.',
    );
  }

  const gasLimit = NATIVE_ETH_TRANSFER_GAS_LIMIT;
  const maxFeePerGasWei = BigInt(input.feeQuote.maxFeePerGasWei);
  const maxPriorityFeePerGasWei = BigInt(input.feeQuote.maxPriorityFeePerGasWei);
  const maxFeeWei = BigInt(gasLimit) * maxFeePerGasWei;
  const totalMaxDebitWei = amountWeiBigInt + maxFeeWei;
  const balanceWei = BigInt(input.balanceWei);

  // Affordability is checked against amount + MAXIMUM possible fee, never
  // amount alone — an amount that exactly equals the balance must still be
  // rejected once any nonzero fee is added.
  if (totalMaxDebitWei > balanceWei) {
    throw new EthereumSendPreparationError(
      'insufficient_funds',
      'The wallet balance cannot cover the amount plus the maximum possible network fee.',
    );
  }

  return {
    senderAddress: input.senderAddress,
    recipient,
    amountWei: toAtomicAmount(amountWeiBigInt.toString(10)),
    maxFeeWei: toAtomicAmount(maxFeeWei.toString(10)),
    totalMaxDebitWei: toAtomicAmount(totalMaxDebitWei.toString(10)),
    nonce: input.nonce,
    gasLimit,
    maxFeePerGasWei: toAtomicAmount(maxFeePerGasWei.toString(10)),
    maxPriorityFeePerGasWei: toAtomicAmount(maxPriorityFeePerGasWei.toString(10)),
    chainId: ETHEREUM_MAINNET_EVM_CHAIN_ID,
    dataHex: NATIVE_ETH_TRANSFER_DATA_HEX,
  };
}

/**
 * Prepares a native ETH V1 Send for a future Review/signing stage. Accepts
 * ONLY the two fields a user actually controls — recipient and ETH amount;
 * nonce, gas, fees, chain id, and RPC endpoint are never caller-suppliable,
 * matching this stage's task scope exactly.
 *
 * Reads the wallet's own address (`getEthereumAddressV1`), current balance,
 * pending nonce, and EIP-1559 fee data in parallel — these three RPC reads
 * are mutually independent (none depends on another's result), so
 * `Promise.all` is used here rather than the sequential pattern
 * `attemptProvidersInOrder` already uses INSIDE each individual read (that
 * sequential-only posture is about provider fallback within one read, not
 * about ordering these three unrelated reads against each other).
 *
 * TOCTOU / review-snapshot guarantee: the returned `EthereumV1PreparedSend`
 * is a plain, frozen-in-time snapshot of what these RPC calls returned at
 * this moment. Nothing in this module re-fetches into it later. A future
 * Review screen must sign exactly this snapshot — if nonce/fees go stale
 * before the user confirms, the correct fix is calling
 * `prepareEthereumV1Send` again for a fresh snapshot (an explicit,
 * visible re-prepare/re-review the user can see happen), never a hidden
 * mutation of an already-returned object.
 *
 * Every failure — recipient/amount validation, and any RPC-layer failure
 * (`EthereumRpcRejectionError`/`EthereumRpcTransportError` from
 * `ethereum-rpc.ts`, or any other unexpected error from the address bridge)
 * — is normalized into `EthereumSendPreparationError`. Raw provider
 * messages, HTTP details, and JSON-RPC error payloads never reach the
 * caller.
 */
export async function prepareEthereumV1Send(
  recipientInput: string,
  amountEthInput: string,
): Promise<EthereumV1PreparedSend> {
  let senderAddress: EthereumAddress;
  let balanceResult: Awaited<ReturnType<typeof fetchEthMainnetBalance>>;
  let nonceResult: Awaited<ReturnType<typeof fetchEthMainnetPendingNonce>>;
  let feeResult: Awaited<ReturnType<typeof fetchEthMainnetFeeData>>;
  try {
    senderAddress = getEthereumAddressV1();
    [balanceResult, nonceResult, feeResult] = await Promise.all([
      fetchEthMainnetBalance(senderAddress),
      fetchEthMainnetPendingNonce(senderAddress),
      fetchEthMainnetFeeData(),
    ]);
  } catch (error) {
    if (error instanceof EthereumRpcRejectionError || error instanceof EthereumRpcTransportError) {
      throw new EthereumSendPreparationError(
        'network_error',
        'Unable to fetch the Ethereum network data required to prepare this transaction.',
      );
    }
    throw new EthereumSendPreparationError(
      'network_error',
      'Unable to prepare this Ethereum transaction.',
    );
  }

  return buildEthereumV1PreparedSend({
    senderAddress,
    recipientInput,
    amountEthInput,
    balanceWei: balanceResult.snapshot.amount,
    nonce: nonceResult.nonce,
    feeQuote: feeResult.feeQuote,
  });
}

/**
 * Converts an `EthereumV1PreparedSend` snapshot into the exact
 * `EthereumV1TransactionIntent` shape Stage 5G.1's
 * `signEthereumTransactionV1` expects — a pure, lossless field mapping.
 * Recomputes nothing: every value here was already decided at prepare time;
 * this function only reshapes it for the signing boundary.
 */
export function toEthereumV1TransactionIntent(
  prepared: EthereumV1PreparedSend,
): EthereumV1TransactionIntent {
  return {
    chainId: prepared.chainId,
    nonce: prepared.nonce,
    toHex: prepared.recipient,
    valueWeiDecimal: prepared.amountWei,
    gasLimit: prepared.gasLimit,
    maxFeePerGasWeiDecimal: prepared.maxFeePerGasWei,
    maxPriorityFeePerGasWeiDecimal: prepared.maxPriorityFeePerGasWei,
    dataHex: prepared.dataHex,
  };
}
