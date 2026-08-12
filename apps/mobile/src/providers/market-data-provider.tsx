import { createContext, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { fetchMarketPrices, type MarketPrices } from '@/services/market-data';

const POLL_INTERVAL_MS = 60_000;
const STALE_THRESHOLD_MS = POLL_INTERVAL_MS * 2;

export type MarketDataContextValue = {
  prices: MarketPrices | null;
  isLoading: boolean;
  error: Error | null;
  lastUpdatedAt: number | null;
  isStale: boolean;
  refresh: () => Promise<void>;
};

export const MarketDataContext = createContext<MarketDataContextValue | undefined>(undefined);

export function MarketDataProvider({ children }: PropsWithChildren) {
  const [prices, setPrices] = useState<MarketPrices | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const isFetchingRef = useRef(false);

  const load = useCallback(async () => {
    if (isFetchingRef.current) {
      return;
    }
    isFetchingRef.current = true;
    setIsFetching(true);

    try {
      const next = await fetchMarketPrices();
      setPrices(next);
      setLastUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch market prices'));
    } finally {
      isFetchingRef.current = false;
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const isStale = lastUpdatedAt !== null && Date.now() - lastUpdatedAt > STALE_THRESHOLD_MS;

  const value: MarketDataContextValue = {
    prices,
    isLoading: isFetching && prices === null,
    error,
    lastUpdatedAt,
    isStale,
    refresh: load,
  };

  return <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>;
}
