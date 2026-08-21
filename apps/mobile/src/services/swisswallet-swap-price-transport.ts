import { fetchWithTimeout } from './provider-failover';
import type { ZeroXAllowanceHolderPriceTransport } from './zero-x-allowance-holder-price-client';

const SWISSWALLET_SWAP_PRICE_PATH = '/v1/swap/price';

/**
 * Adapts the existing provider-specific 0x price client to the SwissWallet
 * server-side proxy.
 *
 * The 0x client still owns deterministic query construction and response
 * validation. This transport changes only the HTTP destination:
 *
 * mobile -> SwissWallet proxy -> 0x
 *
 * No 0x API key exists or is required in the mobile application.
 */
export function createSwissWalletSwapPriceTransport(
  apiBaseUrl: string,
): ZeroXAllowanceHolderPriceTransport {
  const normalizedBase = apiBaseUrl.endsWith('/')
    ? apiBaseUrl.slice(0, -1)
    : apiBaseUrl;

  return {
    // The existing price client appends its provider-specific path before
    // calling authorizedFetch. We intentionally replace that path below,
    // while preserving its already-validated deterministic query string.
    baseUrl: normalizedBase,

    authorizedFetch: async (providerUrl, init) => {
      const queryIndex = providerUrl.indexOf('?');

      if (queryIndex === -1) {
        throw new Error('Swap price request is missing its query string.');
      }

      const query = providerUrl.slice(queryIndex + 1);

      return fetchWithTimeout(
        `${normalizedBase}${SWISSWALLET_SWAP_PRICE_PATH}?${query}`,
        {
          ...init,
          method: 'GET',
        },
      );
    },
  };
}
