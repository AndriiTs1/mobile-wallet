import { toAtomicAmount, type AtomicAmount } from './amount';
import type { AssetId } from './asset-id';
import { toEthereumAddress, type EthereumAddress } from './ethereum-address';
import { toEthereumCalldata, type EthereumCalldata } from './ethereum-calldata';
import type { UnixTimestampMs } from './timestamp';

/**
 * The `AssetId` variants that exist on Ethereum mainnet — `Extract`ed from
 * the full `AssetId` union (which also has a `bitcoin:mainnet` native
 * variant) rather than redefined, so this stays in sync with `asset-id.ts`
 * automatically. V1 swap scope is Ethereum mainnet only; a `SwapQuote`'s
 * `sellAsset`/`buyAsset` are structurally inadmissible as Bitcoin assets by
 * this type alone, with no runtime check required for that half of "correct
 * chain".
 */
export type EthereumSwapAsset = Extract<AssetId, { readonly chainId: 'ethereum:mainnet' }>;

/**
 * The wallet-approved, provider-neutral meaning of an Ethereum-mainnet swap
 * (Stage SWAP 1.2) — not any provider's raw response shape. Carries exactly
 * what a future device-side validation layer (ADR-002 trust boundary) will
 * need to check before signing: correct chain, expected sell/buy assets,
 * exact sell amount, minimum acceptable buy amount, approved spender,
 * transaction target, ETH value, calldata, and quote expiration.
 *
 * Deliberately excludes provider name and any other provider-specific
 * metadata — per ADR-002, provider-supplied swap data is untrusted input,
 * and untrusted provenance metadata must never become part of the trusted,
 * signing-relevant contract.
 *
 * This type does not itself implement the future cross-check against "what
 * the user actually approved" (no such object exists yet) — see
 * `toSwapQuote`'s doc comment for the exact scope of validation performed
 * at this stage.
 */
export type SwapQuote = {
  readonly chainId: 'ethereum:mainnet';
  readonly sellAsset: EthereumSwapAsset;
  readonly buyAsset: EthereumSwapAsset;
  readonly sellAmount: AtomicAmount;
  readonly expectedBuyAmount: AtomicAmount;
  readonly minimumBuyAmount: AtomicAmount;
  /** Present iff `sellAsset` is an ERC-20 (an ERC-20 sell requires an approved spender; a native ETH sell has none). */
  readonly allowanceTarget?: EthereumAddress;
  readonly transactionTarget: EthereumAddress;
  readonly transactionCalldata: EthereumCalldata;
  readonly transactionValueWei: AtomicAmount;
  readonly quoteExpiresAt?: UnixTimestampMs;
};

/**
 * Raw, provider-shaped input to `toSwapQuote`. Every amount/address/calldata
 * field is an untrusted string (ADR-002: a future swap quote/calldata from a
 * provider is untrusted input), not yet a validated domain type.
 * `sellAsset`/`buyAsset` are the one exception: callers resolve those from
 * `SUPPORTED_ASSETS` before calling this, mirroring how `AssetId` values are
 * constructed everywhere else in this package — there is no raw-string
 * `AssetId` parser to duplicate here.
 */
export type SwapQuoteInput = {
  readonly sellAsset: EthereumSwapAsset;
  readonly buyAsset: EthereumSwapAsset;
  readonly sellAmount: string;
  readonly expectedBuyAmount: string;
  readonly minimumBuyAmount: string;
  readonly allowanceTarget?: string;
  readonly transactionTarget: string;
  readonly transactionCalldata: string;
  readonly transactionValueWei: string;
  readonly quoteExpiresAt?: number;
};

/**
 * Validates and constructs a `SwapQuote` from raw provider-shaped input.
 * Follows this package's existing `to*` constructor convention
 * (`toEthereumAddress`, `toAtomicAmount`, ...): throws a plain `Error` on
 * any malformed field, never returns a partially-valid value.
 *
 * Enforces the quote's own internal consistency only:
 * - every address/calldata/amount field is shape-valid,
 * - `sellAsset`/`buyAsset` are both actually Ethereum-mainnet assets,
 * - `minimumBuyAmount` never exceeds `expectedBuyAmount`,
 * - `allowanceTarget` is present exactly when `sellAsset` is an ERC-20,
 * - `quoteExpiresAt`, if present, is a positive integer millisecond
 *   timestamp.
 *
 * This is NOT the full ADR-002 trust-boundary check. It does not compare
 * the result against a separately-held "what the user actually approved"
 * object — no such object exists at this stage (no swap screen logic, no
 * provider integration) — so a later validation stage must still perform
 * that comparison before anything derived from a `SwapQuote` is signed.
 */
export function toSwapQuote(input: SwapQuoteInput): SwapQuote {
  if (input.sellAsset.chainId !== 'ethereum:mainnet' || input.buyAsset.chainId !== 'ethereum:mainnet') {
    throw new Error('Invalid SwapQuote: sellAsset and buyAsset must both be Ethereum mainnet assets.');
  }

  if (
    input.sellAsset.kind === input.buyAsset.kind &&
    (
      input.sellAsset.kind === 'native' ||
      input.sellAsset.contractAddress.toLowerCase() ===
        (input.buyAsset as Extract<EthereumSwapAsset, { readonly kind: 'erc20' }>).contractAddress.toLowerCase()
    )
  ) {
    throw new Error('Invalid SwapQuote: sellAsset and buyAsset must be different assets.');
  }

  const sellAmount = toAtomicAmount(input.sellAmount);
  const expectedBuyAmount = toAtomicAmount(input.expectedBuyAmount);
  const minimumBuyAmount = toAtomicAmount(input.minimumBuyAmount);

  if (BigInt(sellAmount) === 0n) {
    throw new Error('Invalid SwapQuote: sellAmount must be greater than zero.');
  }

  if (BigInt(expectedBuyAmount) === 0n) {
    throw new Error('Invalid SwapQuote: expectedBuyAmount must be greater than zero.');
  }

  if (BigInt(minimumBuyAmount) === 0n) {
    throw new Error('Invalid SwapQuote: minimumBuyAmount must be greater than zero.');
  }

  if (BigInt(minimumBuyAmount) > BigInt(expectedBuyAmount)) {
    throw new Error('Invalid SwapQuote: minimumBuyAmount must not exceed expectedBuyAmount.');
  }

  const transactionTarget = toEthereumAddress(input.transactionTarget);
  const transactionCalldata = toEthereumCalldata(input.transactionCalldata);
  const transactionValueWei = toAtomicAmount(input.transactionValueWei);

  if (
    input.sellAsset.kind === 'native' &&
    BigInt(transactionValueWei) !== BigInt(sellAmount)
  ) {
    throw new Error(
      'Invalid SwapQuote: native ETH sell requires transactionValueWei to equal sellAmount.',
    );
  }

  if (
    input.sellAsset.kind === 'erc20' &&
    BigInt(transactionValueWei) !== 0n
  ) {
    throw new Error(
      'Invalid SwapQuote: ERC-20 sell requires transactionValueWei to be zero.',
    );
  }

  const sellsErc20 = input.sellAsset.kind === 'erc20';
  if (sellsErc20 && input.allowanceTarget === undefined) {
    throw new Error('Invalid SwapQuote: allowanceTarget is required when sellAsset is an ERC-20.');
  }
  if (!sellsErc20 && input.allowanceTarget !== undefined) {
    throw new Error('Invalid SwapQuote: allowanceTarget must be omitted when sellAsset is the native asset.');
  }
  const allowanceTarget =
    input.allowanceTarget === undefined ? undefined : toEthereumAddress(input.allowanceTarget);

  let quoteExpiresAt: UnixTimestampMs | undefined;
  if (input.quoteExpiresAt !== undefined) {
    if (!Number.isInteger(input.quoteExpiresAt) || input.quoteExpiresAt <= 0) {
      throw new Error(
        'Invalid SwapQuote: quoteExpiresAt must be a positive integer millisecond timestamp.',
      );
    }
    quoteExpiresAt = input.quoteExpiresAt;
  }

  return {
    chainId: 'ethereum:mainnet',
    sellAsset: input.sellAsset,
    buyAsset: input.buyAsset,
    sellAmount,
    expectedBuyAmount,
    minimumBuyAmount,
    allowanceTarget,
    transactionTarget,
    transactionCalldata,
    transactionValueWei,
    quoteExpiresAt,
  };
}
