/**
 * Static, presentation-only mock data for the Mobile Wallet UI prototype.
 * Nothing here is derived from a wallet, chain, or backend — it exists purely
 * to give the redesigned screens realistic-looking content to lay out.
 */

export const mockPortfolio = {
  totalBalanceChf: 'CHF 24,568.20',
  changePercent: '+2.45%',
  changeWindowLabel: '(24h)',
  isPositive: true,
};

// Preset points (0-1) for the compact portfolio line chart. A gentle upward
// drift with light, realistic noise — not derived from any real price series.
export const mockChartValues = [
  0.22, 0.26, 0.24, 0.3, 0.28, 0.35, 0.33, 0.4, 0.44, 0.41, 0.48, 0.52, 0.49,
  0.56, 0.6, 0.58, 0.65, 0.7, 0.68, 0.76, 0.82,
];

export type CoinSymbol = 'BTC' | 'ETH' | 'USDC' | 'USDT';

export type MockAsset = {
  symbol: CoinSymbol;
  name: string;
  quantity: number;
  amountLabel: string;
  valueLabel: string;
  changeLabel: string;
  isPositive: boolean;
};

// Renders a raw quantity the same way the previous hand-typed amountLabel
// strings looked, so introducing `quantity` as the source of truth doesn't
// change what's on screen this stage.
function formatAmountLabel(symbol: CoinSymbol, quantity: number, decimals: number): string {
  const formattedQuantity = quantity.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formattedQuantity} ${symbol}`;
}

export const mockAssets: MockAsset[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    quantity: 0.5123,
    amountLabel: formatAmountLabel('BTC', 0.5123, 4),
    valueLabel: 'CHF 16,245.80',
    changeLabel: '+1.35%',
    isPositive: true,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    quantity: 2.1456,
    amountLabel: formatAmountLabel('ETH', 2.1456, 4),
    valueLabel: 'CHF 4,352.70',
    changeLabel: '+2.15%',
    isPositive: true,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    quantity: 1250,
    amountLabel: formatAmountLabel('USDC', 1250, 2),
    valueLabel: 'CHF 1,122.00',
    changeLabel: '+0.01%',
    isPositive: true,
  },
  {
    symbol: 'USDT',
    name: 'Tether',
    quantity: 950,
    amountLabel: formatAmountLabel('USDT', 950, 2),
    valueLabel: 'CHF 847.50',
    changeLabel: '-0.02%',
    isPositive: false,
  },
];
