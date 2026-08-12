import { useContext } from 'react';

import { MarketDataContext } from '@/providers/market-data-provider';

export function useMarketPrices() {
  const context = useContext(MarketDataContext);
  if (context === undefined) {
    throw new Error('useMarketPrices must be used within a MarketDataProvider');
  }
  return context;
}
