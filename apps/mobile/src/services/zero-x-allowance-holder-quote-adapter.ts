// ============================================================================
// Stage SWAP 1.3 — 0x Swap API v2 AllowanceHolder quote adapter.
//
// Converts a raw 0x AllowanceHolder `/swap/allowance-holder/quote` response
// into the provider-neutral `SwapQuote` (`chain-domain`, Stage SWAP 1.2).
// Per ADR-002, a provider's response is UNTRUSTED INPUT — 0x never gets to
// directly decide what Wallet Core signs. This module is exactly (and only)
// the parsing/validation boundary that converts that untrusted shape into
// `toSwapQuote`'s already-validated input, reconciled against what the
// caller actually requested.
//
// No network request lives here — this stage is pure parsing. The caller is
// responsible for actually calling:
//   GET /swap/allowance-holder/price
//   GET /swap/allowance-holder/quote
// and passing the resulting parsed JSON body, alongside the exact request it
// made, to `parseZeroXAllowanceHolderQuote`.
//
// No signing, no broadcast, no approval execution — all deferred to a later
// stage, same as every other `*-preparation.ts` module in this directory.
// ============================================================================

import {
  toAtomicAmount,
  toSwapQuote,
  type AtomicAmount,
  type EthereumSwapAsset,
  type SwapQuote,
  type SwapQuoteInput,
} from 'chain-domain';

/**
 * 0x's well-known sentinel address representing native ETH in a sell/buy
 * token field (the same convention used across 0x's Swap API v1 and v2, and
 * by several other DEX-aggregator APIs) — not a real on-chain contract, and
 * never treated as a valid `EthereumAddress` for any other purpose in this
 * codebase.
 */
const ZERO_X_NATIVE_TOKEN_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

/**
 * Fixed EIP-155 numeric chain id for Ethereum mainnet — the only chain this
 * adapter (and V1 swap scope generally) supports. Mirrors
 * `ethereum-send-preparation.ts`'s `ETHEREUM_MAINNET_EVM_CHAIN_ID`; not
 * imported from there since that constant is private to that module and
 * this is a different trust boundary (request reconciliation, not signing).
 */
const ETHEREUM_MAINNET_EVM_CHAIN_ID = 1;

export type ZeroXAllowanceHolderAdapterErrorReason =
  | 'unsupported_chain'
  | 'malformed_response'
  | 'unexpected_sell_token'
  | 'unexpected_buy_token'
  | 'sell_amount_mismatch'
  | 'missing_transaction'
  | 'missing_min_buy_amount'
  | 'missing_allowance_target'
  | 'allowance_target_mismatch'
  | 'invalid_field';

/**
 * The one error type this module ever throws. Mirrors this directory's
 * existing error-class convention (`EthereumSendPreparationError` in
 * `ethereum-send-preparation.ts`, `EthereumRpcRejectionError`/
 * `EthereumRpcTransportError` in `ethereum-rpc.ts`): every failure mode is
 * normalized into a stable `reason` code, never a bare provider message.
 */
export class ZeroXAllowanceHolderAdapterError extends Error {
  readonly reason: ZeroXAllowanceHolderAdapterErrorReason;

  constructor(reason: ZeroXAllowanceHolderAdapterErrorReason, message: string) {
    super(message);
    this.name = 'ZeroXAllowanceHolderAdapterError';
    this.reason = reason;
  }
}

/**
 * The minimal raw 0x AllowanceHolder `/quote` response shape this adapter
 * consumes — NOT the full documented response. 0x's actual response also
 * carries fields such as `route`, `fees`, `gas`, `gasPrice`, `blockNumber`,
 * and `liquidityAvailable`, none of which this trust boundary needs or
 * passes through (per the task's "provider-specific metadata must never
 * become part of the trusted domain contract" rule). Every field is
 * `unknown`/loosely typed on purpose — this is untrusted network JSON, not
 * yet a validated shape; `parseZeroXAllowanceHolderQuote` does the actual
 * validation.
 *
 * Deliberately has NO chain field: 0x v2 selects the chain purely through
 * the request (a `chainId` query parameter on the actual HTTP call, made by
 * a future stage, not this one) and does not echo it back in the response
 * body. This adapter never invents one — see `ZeroXAllowanceHolderRequestContext.chainId`
 * for where chain correctness is actually enforced.
 */
export type ZeroXAllowanceHolderQuoteResponse = {
  readonly sellToken?: unknown;
  readonly buyToken?: unknown;
  readonly sellAmount?: unknown;
  readonly buyAmount?: unknown;
  /**
   * The v2 Swap API's explicit slippage-adjusted guaranteed-minimum field —
   * the one trustworthy source for `SwapQuote.minimumBuyAmount` (see this
   * file's Stage SWAP 1.3 report: `buyAmount` itself is never used for this,
   * per the task's explicit "do not invent minimumBuyAmount from buyAmount"
   * rule).
   */
  readonly minBuyAmount?: unknown;
  readonly transaction?: {
    readonly to?: unknown;
    readonly data?: unknown;
    readonly value?: unknown;
  };
  /**
   * The documented top-level allowance-target field. Alongside
   * `issues.allowance.spender` below, this is one of the two documented
   * sources this adapter accepts for `SwapQuote.allowanceTarget` on an
   * ERC-20 sell — see `resolveErc20AllowanceTarget`.
   */
  readonly allowanceTarget?: unknown;
  /**
   * Present (non-null) only when the taker's current on-chain allowance to
   * the AllowanceHolder contract is insufficient for this trade. When the
   * taker already holds sufficient allowance, 0x sets `issues.allowance` to
   * `null` and this adapter falls back to the top-level `allowanceTarget`
   * field instead (see `resolveErc20AllowanceTarget`) rather than treating
   * that as an error.
   */
  readonly issues?: {
    readonly allowance?: {
      readonly spender?: unknown;
    } | null;
  } | null;
};

/**
 * What the caller actually asked 0x for — used to reconcile the response
 * against the request, not merely parse the response in isolation. Every
 * field here is already-validated/trusted domain data the caller resolved
 * BEFORE making the request (curated `AssetId`s, an `AtomicAmount`), never a
 * raw provider-supplied value.
 */
export type ZeroXAllowanceHolderRequestContext = {
  /** EIP-155 numeric chain id used for the request. Must be Ethereum mainnet (1) — this adapter supports no other chain. */
  readonly chainId: number;
  readonly sellAsset: EthereumSwapAsset;
  readonly buyAsset: EthereumSwapAsset;
  readonly sellAmount: AtomicAmount;
};

export type ZeroXAllowanceHolderAdapterInput = {
  /** The exact request this response is claimed to answer. */
  readonly request: ZeroXAllowanceHolderRequestContext;
  /** The raw, parsed JSON body of a 0x `/swap/allowance-holder/quote` response — untrusted. */
  readonly response: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function expectedTokenAddress(asset: EthereumSwapAsset): string {
  return asset.kind === 'native' ? ZERO_X_NATIVE_TOKEN_SENTINEL : asset.contractAddress.toLowerCase();
}

/**
 * Resolves `SwapQuote.allowanceTarget` for an ERC-20 sell from the two
 * documented v2 sources: `issues.allowance.spender` and the top-level
 * `allowanceTarget` field. Never reads `transaction.to` for this purpose —
 * the AllowanceHolder flow's documented contract does not guarantee
 * `transaction.to` and the approval spender are the same address in every
 * case, and this adapter does not encode an assumption the official
 * response doesn't state.
 *
 * - Neither present -> reject (`missing_allowance_target`): there is no
 *   longer only one possible reason for this (previously: "allowance
 *   already sufficient"); now it simply means the response gave us nothing
 *   usable at all.
 * - Only one present -> use it. In particular, `issues.allowance === null`
 *   (allowance already sufficient) with a valid top-level `allowanceTarget`
 *   present is NOT an error — the quote is still safely representable.
 * - Both present -> must match case-insensitively (hex-address casing
 *   carries no value); mismatch -> reject (`allowance_target_mismatch`),
 *   never silently prefer one.
 *
 * Format validation (is this actually a well-formed `EthereumAddress`) is
 * deliberately NOT duplicated here — the resolved value flows into
 * `toSwapQuote`'s existing `toEthereumAddress` check at the end of
 * `parseZeroXAllowanceHolderQuote`, which already rejects a malformed
 * address for this exact field.
 */
function resolveErc20AllowanceTarget(body: ZeroXAllowanceHolderQuoteResponse): string {
  const spender = body.issues?.allowance?.spender;
  const topLevel = body.allowanceTarget;

  const spenderPresent = typeof spender === 'string';
  const topLevelPresent = typeof topLevel === 'string';

  if (!spenderPresent && !topLevelPresent) {
    throw new ZeroXAllowanceHolderAdapterError(
      'missing_allowance_target',
      '0x AllowanceHolder quote response has neither issues.allowance.spender nor a top-level "allowanceTarget" ' +
        'for an ERC-20 sell — there is no documented field this adapter can safely read SwapQuote.allowanceTarget from.',
    );
  }

  if (spenderPresent && topLevelPresent && spender.toLowerCase() !== topLevel.toLowerCase()) {
    throw new ZeroXAllowanceHolderAdapterError(
      'allowance_target_mismatch',
      `0x AllowanceHolder quote response issues.allowance.spender ("${spender}") and top-level "allowanceTarget" ` +
        `("${topLevel}") disagree; refusing to guess which one is the actual required spender.`,
    );
  }

  return spenderPresent ? spender : (topLevel as string);
}

/**
 * Validates and converts a raw 0x AllowanceHolder firm-quote response into
 * our provider-neutral `SwapQuote`, reconciled against the exact request
 * (`input.request`) it is claimed to answer. Throws
 * `ZeroXAllowanceHolderAdapterError` for a failure this adapter itself
 * detects, or propagates whatever plain `Error` `toSwapQuote` throws for a
 * field it rejects (malformed address/calldata/amount,
 * `minimumBuyAmount > expectedBuyAmount`, an inconsistent
 * `transactionValueWei`, etc. — reused, not duplicated, from Stage SWAP
 * 1.2's existing validation). Never returns a partially-valid `SwapQuote`.
 *
 * Deliberately does NOT populate `quoteExpiresAt`: the current official 0x
 * v2 AllowanceHolder quote response does not document an explicit
 * quote-expiry timestamp field, and inventing one (e.g. "now + N seconds")
 * would be exactly the kind of fabricated trust this stage must not
 * introduce.
 */
export function parseZeroXAllowanceHolderQuote(input: ZeroXAllowanceHolderAdapterInput): SwapQuote {
  const { request, response } = input;

  if (request.chainId !== ETHEREUM_MAINNET_EVM_CHAIN_ID) {
    throw new ZeroXAllowanceHolderAdapterError(
      'unsupported_chain',
      `This adapter only supports Ethereum mainnet (EVM chain id ${ETHEREUM_MAINNET_EVM_CHAIN_ID}); the request ` +
        `context specified chain id ${request.chainId}.`,
    );
  }

  if (!isRecord(response)) {
    throw new ZeroXAllowanceHolderAdapterError(
      'malformed_response',
      '0x AllowanceHolder quote response was not a JSON object.',
    );
  }
  const body = response as ZeroXAllowanceHolderQuoteResponse;

  if (typeof body.sellToken !== 'string') {
    throw new ZeroXAllowanceHolderAdapterError(
      'malformed_response',
      '0x AllowanceHolder quote response is missing a string "sellToken".',
    );
  }
  if (body.sellToken.toLowerCase() !== expectedTokenAddress(request.sellAsset)) {
    throw new ZeroXAllowanceHolderAdapterError(
      'unexpected_sell_token',
      `0x AllowanceHolder quote response sellToken "${body.sellToken}" does not match the requested sell asset.`,
    );
  }

  if (typeof body.buyToken !== 'string') {
    throw new ZeroXAllowanceHolderAdapterError(
      'malformed_response',
      '0x AllowanceHolder quote response is missing a string "buyToken".',
    );
  }
  if (body.buyToken.toLowerCase() !== expectedTokenAddress(request.buyAsset)) {
    throw new ZeroXAllowanceHolderAdapterError(
      'unexpected_buy_token',
      `0x AllowanceHolder quote response buyToken "${body.buyToken}" does not match the requested buy asset.`,
    );
  }

  if (typeof body.sellAmount !== 'string') {
    throw new ZeroXAllowanceHolderAdapterError(
      'malformed_response',
      '0x AllowanceHolder quote response is missing a string "sellAmount".',
    );
  }
  let responseSellAmount: AtomicAmount;
  try {
    responseSellAmount = toAtomicAmount(body.sellAmount);
  } catch (error) {
    throw new ZeroXAllowanceHolderAdapterError(
      'invalid_field',
      `0x AllowanceHolder quote response has a malformed sellAmount: ${(error as Error).message}`,
    );
  }
  // Exact match, not "close enough": a provider echoing back a different
  // sellAmount than what was requested is treated as untrustworthy, never
  // silently accepted as if the user had requested that amount.
  if (BigInt(responseSellAmount) !== BigInt(request.sellAmount)) {
    throw new ZeroXAllowanceHolderAdapterError(
      'sell_amount_mismatch',
      `0x AllowanceHolder quote response sellAmount "${responseSellAmount}" does not equal the requested ` +
        `sellAmount "${request.sellAmount}".`,
    );
  }

  if (typeof body.buyAmount !== 'string') {
    throw new ZeroXAllowanceHolderAdapterError(
      'malformed_response',
      '0x AllowanceHolder quote response is missing a string "buyAmount".',
    );
  }
  if (typeof body.minBuyAmount !== 'string') {
    throw new ZeroXAllowanceHolderAdapterError(
      'missing_min_buy_amount',
      '0x AllowanceHolder quote response is missing "minBuyAmount" — there is no other field in the current ' +
        'official response this adapter treats as a trustworthy minimum-buy-amount guarantee, so this quote ' +
        'cannot safely populate SwapQuote.minimumBuyAmount.',
    );
  }

  const transaction = body.transaction;
  if (!isRecord(transaction)) {
    throw new ZeroXAllowanceHolderAdapterError(
      'missing_transaction',
      '0x AllowanceHolder quote response is missing its "transaction" object.',
    );
  }
  if (typeof transaction.to !== 'string') {
    throw new ZeroXAllowanceHolderAdapterError(
      'missing_transaction',
      '0x AllowanceHolder quote response transaction is missing a string "to".',
    );
  }
  if (typeof transaction.data !== 'string') {
    throw new ZeroXAllowanceHolderAdapterError(
      'missing_transaction',
      '0x AllowanceHolder quote response transaction is missing a string "data".',
    );
  }
  if (typeof transaction.value !== 'string') {
    throw new ZeroXAllowanceHolderAdapterError(
      'missing_transaction',
      '0x AllowanceHolder quote response transaction is missing a string "value".',
    );
  }

  // Native ETH sell: `allowanceTarget` stays undefined unconditionally,
  // regardless of anything present in `body.issues` or the top-level
  // `body.allowanceTarget` — a native sell never requires (or causes) an
  // ERC-20 approval, matching `toSwapQuote`'s own invariant. Provider
  // allowance fields on a native sell are read by nothing below.
  const allowanceTarget =
    request.sellAsset.kind === 'erc20' ? resolveErc20AllowanceTarget(body) : undefined;

  const swapQuoteInput: SwapQuoteInput = {
    sellAsset: request.sellAsset,
    buyAsset: request.buyAsset,
    sellAmount: responseSellAmount,
    expectedBuyAmount: body.buyAmount,
    minimumBuyAmount: body.minBuyAmount,
    allowanceTarget,
    transactionTarget: transaction.to,
    transactionCalldata: transaction.data,
    transactionValueWei: transaction.value,
  };

  try {
    return toSwapQuote(swapQuoteInput);
  } catch (error) {
    throw new ZeroXAllowanceHolderAdapterError(
      'invalid_field',
      `0x AllowanceHolder quote response failed SwapQuote validation: ${(error as Error).message}`,
    );
  }
}
