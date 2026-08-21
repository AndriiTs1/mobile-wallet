import type {
  AtomicAmount,
  EthereumAddress,
  EthereumSwapAsset,
  SwapQuote,
} from 'chain-domain';

import { fetchWithTimeout } from './provider-failover';
import {
  ETHEREUM_MAINNET_EVM_CHAIN_ID,
  parseZeroXAllowanceHolderQuote,
  zeroXTokenIdentifierFor,
  type ZeroXAllowanceHolderRequestContext,
} from './zero-x-allowance-holder-quote-adapter';

const ZERO_X_ALLOWANCE_HOLDER_QUOTE_PATH =
  '/swap/allowance-holder/quote';

export type ZeroXAllowanceHolderQuoteClientErrorReason =
  | 'unsupported_chain'
  | 'transport_error'
  | 'http_error'
  | 'malformed_response';

export class ZeroXAllowanceHolderQuoteClientError extends Error {
  readonly reason: ZeroXAllowanceHolderQuoteClientErrorReason;

  constructor(
    reason: ZeroXAllowanceHolderQuoteClientErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'ZeroXAllowanceHolderQuoteClientError';
    this.reason = reason;
  }
}

export type ZeroXAllowanceHolderQuoteRequestContext = {
  readonly chainId: number;
  readonly sellAsset: EthereumSwapAsset;
  readonly buyAsset: EthereumSwapAsset;
  readonly sellAmount: AtomicAmount;
  readonly taker: EthereumAddress;
};

export type ZeroXAllowanceHolderQuoteQuery = {
  readonly chainId: string;
  readonly sellToken: string;
  readonly buyToken: string;
  readonly sellAmount: AtomicAmount;
  readonly taker: EthereumAddress;
};

export type ZeroXAllowanceHolderQuoteRequest = {
  readonly path: typeof ZERO_X_ALLOWANCE_HOLDER_QUOTE_PATH;
  readonly query: ZeroXAllowanceHolderQuoteQuery;
};

export function buildZeroXAllowanceHolderQuoteRequest(
  context: ZeroXAllowanceHolderQuoteRequestContext,
): ZeroXAllowanceHolderQuoteRequest {
  if (context.chainId !== ETHEREUM_MAINNET_EVM_CHAIN_ID) {
    throw new ZeroXAllowanceHolderQuoteClientError(
      'unsupported_chain',
      'This client only supports Ethereum mainnet.',
    );
  }

  return {
    path: ZERO_X_ALLOWANCE_HOLDER_QUOTE_PATH,
    query: {
      chainId: String(context.chainId),
      sellToken: zeroXTokenIdentifierFor(context.sellAsset),
      buyToken: zeroXTokenIdentifierFor(context.buyAsset),
      sellAmount: context.sellAmount,
      taker: context.taker,
    },
  };
}

export function buildZeroXAllowanceHolderQuoteUrl(
  baseUrl: string,
  request: ZeroXAllowanceHolderQuoteRequest,
): string {
  const normalizedBase = baseUrl.endsWith('/')
    ? baseUrl.slice(0, -1)
    : baseUrl;

  const queryString = Object.entries(request.query)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');

  return `${normalizedBase}${request.path}?${queryString}`;
}

export type ZeroXAllowanceHolderQuoteAuthorizedFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export type ZeroXAllowanceHolderQuoteTransport = {
  readonly baseUrl: string;
  readonly authorizedFetch: ZeroXAllowanceHolderQuoteAuthorizedFetch;
};

export function createZeroXQuoteFetchWithTimeoutTransport(
  baseUrl: string,
  headers: Readonly<Record<string, string>> = {},
  timeoutMs?: number,
): ZeroXAllowanceHolderQuoteTransport {
  return {
    baseUrl,

    authorizedFetch: (url, init) =>
      fetchWithTimeout(
        url,
        {
          ...init,
          headers: {
            ...headers,
            ...(init.headers ?? {}),
          },
        },
        timeoutMs,
      ),
  };
}

function toAdapterRequestContext(
  context: ZeroXAllowanceHolderQuoteRequestContext,
): ZeroXAllowanceHolderRequestContext {
  return {
    chainId: context.chainId,
    sellAsset: context.sellAsset,
    buyAsset: context.buyAsset,
    sellAmount: context.sellAmount,
  };
}

/**
 * Fetches a firm executable 0x AllowanceHolder quote.
 *
 * Security boundary:
 * - authentication belongs to the injected transport;
 * - no API key is read here;
 * - raw provider data is never returned to callers;
 * - the response must pass the existing provider-neutral quote adapter
 *   before it can become a SwapQuote;
 * - no signing or broadcasting happens here.
 */
export async function fetchZeroXAllowanceHolderQuote(
  context: ZeroXAllowanceHolderQuoteRequestContext,
  transport: ZeroXAllowanceHolderQuoteTransport,
): Promise<SwapQuote> {
  const request =
    buildZeroXAllowanceHolderQuoteRequest(context);

  const url =
    buildZeroXAllowanceHolderQuoteUrl(
      transport.baseUrl,
      request,
    );

  let response: Response;

  try {
    response = await transport.authorizedFetch(url, {
      method: 'GET',
    });
  } catch {
    throw new ZeroXAllowanceHolderQuoteClientError(
      'transport_error',
      'Failed to reach the 0x AllowanceHolder quote endpoint.',
    );
  }

  if (!response.ok) {
    throw new ZeroXAllowanceHolderQuoteClientError(
      'http_error',
      `0x AllowanceHolder quote request failed with status ${response.status}.`,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ZeroXAllowanceHolderQuoteClientError(
      'malformed_response',
      '0x AllowanceHolder quote response was not valid JSON.',
    );
  }

  return parseZeroXAllowanceHolderQuote({
    request: toAdapterRequestContext(context),
    response: payload,
  });
}
