import type {
  EthereumAddress,
  SwapQuote,
} from 'chain-domain';

import { createSwissWalletSwapQuoteTransport } from './swisswallet-swap-quote-transport';
import { fetchZeroXAllowanceHolderQuote } from './zero-x-allowance-holder-quote-client';

export type SwapExecutionQuoteErrorReason =
  | 'review_mismatch'
  | 'price_moved';

export class SwapExecutionQuoteError extends Error {
  readonly reason: SwapExecutionQuoteErrorReason;

  constructor(
    reason: SwapExecutionQuoteErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'SwapExecutionQuoteError';
    this.reason = reason;
  }
}

function sameAsset(
  left: SwapQuote['sellAsset'],
  right: SwapQuote['sellAsset'],
): boolean {
  if (
    left.chainId !== right.chainId ||
    left.kind !== right.kind
  ) {
    return false;
  }

  if (left.kind === 'native' && right.kind === 'native') {
    return true;
  }

  if (left.kind === 'erc20' && right.kind === 'erc20') {
    return (
      left.contractAddress.toLowerCase() ===
      right.contractAddress.toLowerCase()
    );
  }

  return false;
}

/**
 * Obtains a fresh executable firm quote immediately before preparation/signing
 * and reconciles it against the quote the user reviewed.
 *
 * The provider may refresh routing/calldata, but it may NOT change:
 * - chain
 * - sell asset
 * - buy asset
 * - exact sell amount
 *
 * The refreshed minimum output may also never fall below the minimum amount
 * already reviewed by the user. If market movement makes that impossible,
 * execution stops and the user must return to Swap for a new review.
 *
 * No signing.
 * No broadcast.
 * No authentication.
 */
export async function refreshReviewedSwapQuote(
  reviewed: SwapQuote,
  taker: EthereumAddress,
  apiBaseUrl: string,
): Promise<SwapQuote> {
  const transport =
    createSwissWalletSwapQuoteTransport(apiBaseUrl);

  const fresh = await fetchZeroXAllowanceHolderQuote(
    {
      chainId: 1,
      sellAsset: reviewed.sellAsset,
      buyAsset: reviewed.buyAsset,
      sellAmount: reviewed.sellAmount,
      taker,
    },
    transport,
  );

  if (
    fresh.chainId !== reviewed.chainId ||
    !sameAsset(fresh.sellAsset, reviewed.sellAsset) ||
    !sameAsset(fresh.buyAsset, reviewed.buyAsset) ||
    BigInt(fresh.sellAmount) !== BigInt(reviewed.sellAmount)
  ) {
    throw new SwapExecutionQuoteError(
      'review_mismatch',
      'Fresh swap quote no longer matches the reviewed swap.',
    );
  }

  if (
    BigInt(fresh.minimumBuyAmount) <
    BigInt(reviewed.minimumBuyAmount)
  ) {
    throw new SwapExecutionQuoteError(
      'price_moved',
      'The swap price moved beyond the reviewed minimum receive amount.',
    );
  }

  return fresh;
}
