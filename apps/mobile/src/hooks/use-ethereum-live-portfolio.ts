import { useCallback, useEffect, useState } from 'react';

import {
  fetchEthereumLivePortfolio,
  type EthereumLivePortfolio,
} from '@/services/ethereum-live-portfolio';
import {
  getBitcoinAddressV1,
  getEthereumAddressV1,
} from '@/services/wallet-core-bridge';

export type EthereumLivePortfolioState = {
  readonly portfolio: EthereumLivePortfolio | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly refresh: () => Promise<void>;
};

export function useEthereumLivePortfolio(): EthereumLivePortfolioState {
  const [portfolio, setPortfolio] =
    useState<EthereumLivePortfolio | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const owner = getEthereumAddressV1();
      const bitcoinAddress = getBitcoinAddressV1();

      const next = await fetchEthereumLivePortfolio(
        owner,
        bitcoinAddress,
      );

      setPortfolio(next);
      setError(null);
    } catch (err) {
      setPortfolio(null);
      setError(
        err instanceof Error
          ? err
          : new Error('Failed to fetch Ethereum portfolio'),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    portfolio,
    isLoading,
    error,
    refresh: load,
  };
}
