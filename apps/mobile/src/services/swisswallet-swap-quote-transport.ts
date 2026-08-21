import { fetchWithTimeout } from './provider-failover';
import type { ZeroXAllowanceHolderQuoteTransport } from './zero-x-allowance-holder-quote-client';

const SWISSWALLET_SWAP_QUOTE_PATH = '/v1/swap/quote';

/**
 * Adapts the existing provider-specific 0x firm quote client to the
 * SwissWallet server-side proxy.
 *
 * The 0x quote client still owns deterministic query construction and
 * response validation. This transport changes only the HTTP destination:
 *
 * mobile -> SwissWallet proxy -> 0x
 *
 * No 0x API key exists or is required in the mobile application.
 */
export function createSwissWalletSwapQuoteTransport(
  apiBaseUrl: string,
): ZeroXAllowanceHolderQuoteTransport {
  const normalizedBase = apiBaseUrl.endsWith('/')
    ? apiBaseUrl.slice(0, -1)
    : apiBaseUrl;

  return {
    baseUrl: normalizedBase,

    authorizedFetch: async (providerUrl, init) => {
      const queryIndex = providerUrl.indexOf('?');

      if (queryIndex === -1) {
        throw new Error('Swap quote request is missing its query string.');
      }

      const query = providerUrl.slice(queryIndex + 1);

      return fetchWithTimeout(
        `${normalizedBase}${SWISSWALLET_SWAP_QUOTE_PATH}?${query}`,
        {
          ...init,
          method: 'GET',
        },
      );
    },
  };
}
