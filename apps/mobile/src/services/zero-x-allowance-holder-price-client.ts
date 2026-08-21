// ============================================================================
// Stage SWAP 1.4A — 0x Swap API v2 AllowanceHolder /price request builder +
// transport boundary.
//
// Builds the deterministic GET /swap/allowance-holder/price request and
// parses its response into a small, informational-only preview type. Per
// ADR-002, a provider's response is UNTRUSTED INPUT; per this stage's task,
// an API key embedded in a React Native bundle must never be treated as
// secret, so this module never imports one from `process.env` or Expo app
// config — authentication/base URL are always a caller-injected
// `ZeroXAllowanceHolderPriceTransport`, so the actual HTTP call (and where
// its credentials come from) can later move behind a Swiss Wallet
// backend/proxy without this module, `SwapQuote`, the `/quote` adapter, or
// swap UI changing at all.
//
// /price is indicative/pre-review only — it is NEVER converted into an
// executable `SwapQuote`. That conversion remains exclusively the firm
// `/quote` endpoint's job, via `zero-x-allowance-holder-quote-adapter.ts`
// (Stage SWAP 1.3). `ZeroXAllowanceHolderPricePreview` below has no
// transaction target/calldata/value field — there is nothing in this module
// that could be signed or broadcast even by mistake.
//
// No signing, no broadcast, no approval execution, no UI.
// ============================================================================

import {
  toAtomicAmount,
  toEthereumAddress,
  type AtomicAmount,
  type EthereumAddress,
  type EthereumSwapAsset,
} from 'chain-domain';

import { fetchWithTimeout } from './provider-failover';
import { ETHEREUM_MAINNET_EVM_CHAIN_ID, zeroXTokenIdentifierFor } from './zero-x-allowance-holder-quote-adapter';

const ZERO_X_ALLOWANCE_HOLDER_PRICE_PATH = '/swap/allowance-holder/price';

export type ZeroXAllowanceHolderPriceErrorReason =
  | 'unsupported_chain'
  | 'transport_error'
  | 'http_error'
  | 'malformed_response'
  | 'unexpected_sell_token'
  | 'unexpected_buy_token'
  | 'sell_amount_mismatch'
  | 'invalid_field';

/**
 * The one error type this module ever throws. Mirrors
 * `zero-x-allowance-holder-quote-adapter.ts`'s `ZeroXAllowanceHolderAdapterError`
 * convention: a stable `reason` code, and a `message` that never embeds the
 * built request URL, response body, headers, or any provider error detail —
 * only a generic description plus (for reconciliation failures) the
 * specific mismatched field values, matching the quote adapter's existing
 * level of detail.
 */
export class ZeroXAllowanceHolderPriceError extends Error {
  readonly reason: ZeroXAllowanceHolderPriceErrorReason;

  constructor(reason: ZeroXAllowanceHolderPriceErrorReason, message: string) {
    super(message);
    this.name = 'ZeroXAllowanceHolderPriceError';
    this.reason = reason;
  }
}

/**
 * What the caller is asking 0x to price — every field already-validated
 * trusted domain data the caller resolved before building the request
 * (curated `EthereumSwapAsset`s, an `AtomicAmount`, and the wallet's own
 * `EthereumAddress`), never a raw provider-supplied value. `taker` should be
 * obtained via `getEthereumAddressV1()` (`wallet-core-bridge.ts`); this
 * module does not derive it itself, keeping it independent of wallet
 * internals.
 */
export type ZeroXAllowanceHolderPriceReconciliationContext = {
  /** EIP-155 numeric chain id for the request. Must be Ethereum mainnet (1) — this client supports no other chain. */
  readonly chainId: number;
  readonly sellAsset: EthereumSwapAsset;
  readonly buyAsset: EthereumSwapAsset;
  readonly sellAmount: AtomicAmount;
};

export type ZeroXAllowanceHolderPriceRequestContext = ZeroXAllowanceHolderPriceReconciliationContext & {
  readonly taker: EthereumAddress;
};

export type ZeroXAllowanceHolderPriceQuery = {
  readonly chainId: string;
  readonly sellToken: string;
  readonly buyToken: string;
  readonly sellAmount: string;
  readonly taker: string;
};

export type ZeroXAllowanceHolderPriceRequest = {
  readonly path: typeof ZERO_X_ALLOWANCE_HOLDER_PRICE_PATH;
  /** Deterministic key order (chainId, sellToken, buyToken, sellAmount, taker) — the official fields required for exact-input pricing, nothing else. No API key or header ever lives here. */
  readonly query: ZeroXAllowanceHolderPriceQuery;
};

/**
 * Builds the `/swap/allowance-holder/price` request deterministically from
 * an already-validated context — no network I/O. Curated assets are mapped
 * to 0x's documented token identifiers via `zeroXTokenIdentifierFor`
 * (native-ETH sentinel or ERC-20 `contractAddress`), never by symbol/name.
 */
export function buildZeroXAllowanceHolderPriceRequest(
  context: ZeroXAllowanceHolderPriceRequestContext,
): ZeroXAllowanceHolderPriceRequest {
  if (context.chainId !== ETHEREUM_MAINNET_EVM_CHAIN_ID) {
    throw new ZeroXAllowanceHolderPriceError(
      'unsupported_chain',
      `This client only supports Ethereum mainnet (EVM chain id ${ETHEREUM_MAINNET_EVM_CHAIN_ID}); the request ` +
        `context specified chain id ${context.chainId}.`,
    );
  }

  return {
    path: ZERO_X_ALLOWANCE_HOLDER_PRICE_PATH,
    query: {
      chainId: String(context.chainId),
      sellToken: zeroXTokenIdentifierFor(context.sellAsset),
      buyToken: zeroXTokenIdentifierFor(context.buyAsset),
      sellAmount: context.sellAmount,
      taker: context.taker,
    },
  };
}

/**
 * Renders a built request against a base URL into a full URL string. Manual
 * string construction (not the `URL`/`URLSearchParams` globals) — this
 * codebase has no established dependency on their availability in the
 * Hermes/React Native runtime, so this avoids introducing an unverified
 * runtime assumption. Every query value is `encodeURIComponent`-escaped.
 */
export function buildZeroXAllowanceHolderPriceUrl(baseUrl: string, request: ZeroXAllowanceHolderPriceRequest): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const queryString = Object.entries(request.query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${normalizedBase}${request.path}?${queryString}`;
}

/**
 * A caller-supplied fetch-like function that performs the actual HTTP GET.
 * The transport owns ALL authentication/API-key semantics — e.g. wrapping
 * `fetchWithTimeout` with a `0x-Api-Key` header, or proxying the call
 * through a future Swiss Wallet backend that injects credentials
 * server-side. This module never imports a secret itself and never reads
 * `process.env` or Expo app config for one.
 */
export type ZeroXAllowanceHolderPriceAuthorizedFetch = (url: string, init: RequestInit) => Promise<Response>;

export type ZeroXAllowanceHolderPriceTransport = {
  readonly baseUrl: string;
  readonly authorizedFetch: ZeroXAllowanceHolderPriceAuthorizedFetch;
};

/**
 * Convenience constructor for the common case: a plain base URL plus static
 * headers, executed through the existing `fetchWithTimeout` primitive.
 * `headers` is accepted purely as a caller-supplied argument — this
 * function never sources it from `process.env`/app config itself, so
 * nothing about *where an API key comes from* is owned here; the caller
 * decides. Prefer constructing a `ZeroXAllowanceHolderPriceTransport`
 * directly (with a fully custom `authorizedFetch`, e.g. one that calls a
 * backend proxy instead of 0x directly) when this convenience shape doesn't
 * fit.
 */
export function createFetchWithTimeoutTransport(
  baseUrl: string,
  headers: Readonly<Record<string, string>> = {},
  timeoutMs?: number,
): ZeroXAllowanceHolderPriceTransport {
  return {
    baseUrl,
    authorizedFetch: (url, init) =>
      fetchWithTimeout(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } }, timeoutMs),
  };
}

/**
 * The minimal raw 0x AllowanceHolder `/price` response shape this client
 * consumes — NOT the full documented response (route/fees/gas/etc. are
 * never modeled here, same posture as the `/quote` adapter). Has no
 * `transaction` field: 0x's `/price` endpoint is indicative and does not
 * generate executable calldata — there is nothing transaction-shaped to
 * even accidentally read.
 */
export type ZeroXAllowanceHolderPriceResponse = {
  readonly sellToken?: unknown;
  readonly buyToken?: unknown;
  readonly sellAmount?: unknown;
  readonly buyAmount?: unknown;
  readonly minBuyAmount?: unknown;
  readonly liquidityAvailable?: unknown;
  readonly allowanceTarget?: unknown;
  readonly issues?: {
    readonly allowance?: {
      readonly spender?: unknown;
    } | null;
  } | null;
};

/**
 * The provider-neutral, informational-only preview of a 0x price — NOT a
 * `SwapQuote` and structurally incapable of becoming one: there is no
 * `transactionTarget`/`transactionCalldata`/`transactionValueWei` field
 * here for anything to sign or broadcast. Executable quotes remain
 * exclusively the firm `/quote` endpoint's responsibility
 * (`zero-x-allowance-holder-quote-adapter.ts`).
 */
export type ZeroXAllowanceHolderPricePreview = {
  readonly chainId: 'ethereum:mainnet';
  readonly sellAsset: EthereumSwapAsset;
  readonly buyAsset: EthereumSwapAsset;
  readonly sellAmount: AtomicAmount;
  readonly buyAmount: AtomicAmount;
  /** Present only when the response documented it — never derived/estimated from `buyAmount` by this module. */
  readonly minBuyAmount?: AtomicAmount;
  /** Present only when a documented source (`issues.allowance.spender` or top-level `allowanceTarget`) supplied one for an ERC-20 sell. Always absent for a native ETH sell. */
  readonly allowanceTarget?: EthereumAddress;
  /** Mapped 1:1 from the response's `liquidityAvailable` boolean when present; never defaulted/invented when absent. */
  readonly liquidityAvailable?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validates and converts a raw 0x AllowanceHolder `/price` response into a
 * `ZeroXAllowanceHolderPricePreview`, reconciled against the exact request
 * (`input.request`) it is claimed to answer — pure, synchronous, no network
 * I/O. Throws `ZeroXAllowanceHolderPriceError` for any response this
 * boundary cannot safely accept; never returns a partially-valid preview.
 *
 * Reconciliation performed: `sellToken`/`buyToken` must match the requested
 * assets (0x native-ETH sentinel or ERC-20 `contractAddress`, never
 * symbol/name), and `sellAmount` must exactly equal what was requested — a
 * provider echoing back a different amount is never silently accepted.
 * There is no chain field in the response to reconcile (0x selects chain
 * purely through the request); this module never invents one.
 *
 * Unlike the firm `/quote` adapter, a missing `minBuyAmount` or
 * `allowanceTarget` is NOT an error here — `/price` is informational only,
 * nothing is executed from it, so partial data is acceptable and simply
 * omitted from the preview rather than rejected.
 */
export function parseZeroXAllowanceHolderPricePreview(input: {
  readonly request: ZeroXAllowanceHolderPriceReconciliationContext;
  readonly response: unknown;
}): ZeroXAllowanceHolderPricePreview {
  const { request, response } = input;

  if (request.chainId !== ETHEREUM_MAINNET_EVM_CHAIN_ID) {
    throw new ZeroXAllowanceHolderPriceError(
      'unsupported_chain',
      `This client only supports Ethereum mainnet (EVM chain id ${ETHEREUM_MAINNET_EVM_CHAIN_ID}); the request ` +
        `context specified chain id ${request.chainId}.`,
    );
  }

  if (!isRecord(response)) {
    throw new ZeroXAllowanceHolderPriceError(
      'malformed_response',
      '0x AllowanceHolder price response was not a JSON object.',
    );
  }
  const body = response as ZeroXAllowanceHolderPriceResponse;

  if (typeof body.sellToken !== 'string') {
    throw new ZeroXAllowanceHolderPriceError(
      'malformed_response',
      '0x AllowanceHolder price response is missing a string "sellToken".',
    );
  }
  if (body.sellToken.toLowerCase() !== zeroXTokenIdentifierFor(request.sellAsset)) {
    throw new ZeroXAllowanceHolderPriceError(
      'unexpected_sell_token',
      `0x AllowanceHolder price response sellToken "${body.sellToken}" does not match the requested sell asset.`,
    );
  }

  if (typeof body.buyToken !== 'string') {
    throw new ZeroXAllowanceHolderPriceError(
      'malformed_response',
      '0x AllowanceHolder price response is missing a string "buyToken".',
    );
  }
  if (body.buyToken.toLowerCase() !== zeroXTokenIdentifierFor(request.buyAsset)) {
    throw new ZeroXAllowanceHolderPriceError(
      'unexpected_buy_token',
      `0x AllowanceHolder price response buyToken "${body.buyToken}" does not match the requested buy asset.`,
    );
  }

  if (typeof body.sellAmount !== 'string') {
    throw new ZeroXAllowanceHolderPriceError(
      'malformed_response',
      '0x AllowanceHolder price response is missing a string "sellAmount".',
    );
  }
  let responseSellAmount: AtomicAmount;
  try {
    responseSellAmount = toAtomicAmount(body.sellAmount);
  } catch (error) {
    throw new ZeroXAllowanceHolderPriceError(
      'invalid_field',
      `0x AllowanceHolder price response has a malformed sellAmount: ${(error as Error).message}`,
    );
  }
  // Exact match, not "close enough" — same posture as the /quote adapter.
  if (BigInt(responseSellAmount) !== BigInt(request.sellAmount)) {
    throw new ZeroXAllowanceHolderPriceError(
      'sell_amount_mismatch',
      `0x AllowanceHolder price response sellAmount "${responseSellAmount}" does not equal the requested ` +
        `sellAmount "${request.sellAmount}".`,
    );
  }

  if (typeof body.buyAmount !== 'string') {
    throw new ZeroXAllowanceHolderPriceError(
      'malformed_response',
      '0x AllowanceHolder price response is missing a string "buyAmount".',
    );
  }
  let buyAmount: AtomicAmount;
  try {
    buyAmount = toAtomicAmount(body.buyAmount);
  } catch (error) {
    throw new ZeroXAllowanceHolderPriceError(
      'invalid_field',
      `0x AllowanceHolder price response has a malformed buyAmount: ${(error as Error).message}`,
    );
  }

  let minBuyAmount: AtomicAmount | undefined;
  if (body.minBuyAmount !== undefined) {
    if (typeof body.minBuyAmount !== 'string') {
      throw new ZeroXAllowanceHolderPriceError(
        'invalid_field',
        '0x AllowanceHolder price response has a non-string "minBuyAmount".',
      );
    }
    try {
      minBuyAmount = toAtomicAmount(body.minBuyAmount);
    } catch (error) {
      throw new ZeroXAllowanceHolderPriceError(
        'invalid_field',
        `0x AllowanceHolder price response has a malformed minBuyAmount: ${(error as Error).message}`,
      );
    }
  }

  // Native ETH sell: `allowanceTarget` stays undefined unconditionally,
  // regardless of anything present in `body.issues` or the top-level
  // `body.allowanceTarget` — a native sell never requires (or causes) an
  // ERC-20 approval. Never inferred from anything else in the response.
  let allowanceTarget: EthereumAddress | undefined;
  if (request.sellAsset.kind === 'erc20') {
    const spender = body.issues?.allowance?.spender;
    const topLevel = body.allowanceTarget;
    const spenderPresent = typeof spender === 'string';
    const topLevelPresent = typeof topLevel === 'string';

    if (spenderPresent && topLevelPresent && spender.toLowerCase() !== topLevel.toLowerCase()) {
      throw new ZeroXAllowanceHolderPriceError(
        'invalid_field',
        `0x AllowanceHolder price response issues.allowance.spender ("${spender}") and top-level ` +
          `"allowanceTarget" ("${topLevel}") disagree; refusing to guess which one is the actual spender.`,
      );
    }

    // Neither present is NOT an error here (unlike the firm /quote adapter):
    // a preview with no allowance info yet is still a usable price preview.
    const rawAllowanceTarget = spenderPresent ? spender : topLevelPresent ? topLevel : undefined;
    if (rawAllowanceTarget !== undefined) {
      try {
        allowanceTarget = toEthereumAddress(rawAllowanceTarget);
      } catch (error) {
        throw new ZeroXAllowanceHolderPriceError(
          'invalid_field',
          `0x AllowanceHolder price response has a malformed allowance target: ${(error as Error).message}`,
        );
      }
    }
  }

  const liquidityAvailable = typeof body.liquidityAvailable === 'boolean' ? body.liquidityAvailable : undefined;

  return {
    chainId: 'ethereum:mainnet',
    sellAsset: request.sellAsset,
    buyAsset: request.buyAsset,
    sellAmount: responseSellAmount,
    buyAmount,
    minBuyAmount,
    allowanceTarget,
    liquidityAvailable,
  };
}

/**
 * Builds the `/price` request, performs it through the injected `transport`,
 * and parses the result into a `ZeroXAllowanceHolderPricePreview`. This is
 * the only function in this module that does network I/O, and it never
 * touches `process.env`/app config — `transport.authorizedFetch` owns
 * whatever authentication the actual call needs.
 *
 * Network/HTTP-layer failures are normalized into `ZeroXAllowanceHolderPriceError`
 * with a generic message: the built URL, response body, and any transport-
 * level error detail are deliberately never included, so nothing raw ever
 * reaches a UI-facing error message.
 */
export async function fetchZeroXAllowanceHolderPrice(
  context: ZeroXAllowanceHolderPriceRequestContext,
  transport: ZeroXAllowanceHolderPriceTransport,
): Promise<ZeroXAllowanceHolderPricePreview> {
  const request = buildZeroXAllowanceHolderPriceRequest(context);
  const url = buildZeroXAllowanceHolderPriceUrl(transport.baseUrl, request);

  let response: Response;
  try {
    response = await transport.authorizedFetch(url, { method: 'GET' });
  } catch {
    throw new ZeroXAllowanceHolderPriceError(
      'transport_error',
      'Failed to reach the 0x AllowanceHolder price endpoint.',
    );
  }

  if (!response.ok) {
    throw new ZeroXAllowanceHolderPriceError(
      'http_error',
      `0x AllowanceHolder price request failed with status ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ZeroXAllowanceHolderPriceError(
      'malformed_response',
      '0x AllowanceHolder price response was not valid JSON.',
    );
  }

  return parseZeroXAllowanceHolderPricePreview({ request: context, response: payload });
}
