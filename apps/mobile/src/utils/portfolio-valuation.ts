import type {
  CoinSymbol,
  MockAsset,
} from '@/constants/mock-portfolio';
import type {
  MarketPrices,
  MarketSymbol,
} from '@/services/market-data';

export const VALUE_PLACEHOLDER = '—';

function toMarketSymbol(
  symbol: CoinSymbol,
): MarketSymbol | null {
  switch (symbol) {
    case 'BTC':
    case 'ETH':
    case 'USDC':
    case 'USDT':
    case 'XAUT':
      return symbol;
  }
}

function getPriceEntry(
  symbol: CoinSymbol,
  prices: MarketPrices | null,
) {
  if (!prices) {
    return null;
  }

  const marketSymbol = toMarketSymbol(symbol);

  return marketSymbol ? prices[marketSymbol] : null;
}

export function formatChf(amountChf: number): string {
  return `CHF ${amountChf.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatChangePercent(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

export function computeAssetValueChf(
  asset: MockAsset,
  prices: MarketPrices | null,
): number | null {
  const priceEntry = getPriceEntry(asset.symbol, prices);

  return priceEntry
    ? asset.quantity * priceEntry.priceChf
    : null;
}

export function computeAssetChange24hPercent(asset: MockAsset, prices: MarketPrices | null): number | null {
  const priceEntry = getPriceEntry(asset.symbol, prices);
  return priceEntry ? priceEntry.change24hPercent : null;
}

/** null = unavailable (neutral placeholder), never a fabricated sign. */
export function toPositiveFlag(value: number | null): boolean | null {
  return value !== null ? value >= 0 : null;
}

export function computeTotalValueChf(
  assets: MockAsset[],
  prices: MarketPrices | null,
): number | null {
  if (!prices) {
    return null;
  }

  let total = 0;

  for (const asset of assets) {
    const priceEntry = getPriceEntry(asset.symbol, prices);

    if (!priceEntry) {
      return null;
    }

    total += asset.quantity * priceEntry.priceChf;
  }

  return total;
}

/**
 * Value-weighted, not a naive average of each asset's %. Reconstructs every
 * asset's CHF value ~24h ago from its current value and its own 24h % change,
 * then compares total-now to total-24h-ago. An asset with an unknown 24h
 * change is treated as flat for this calculation only — never fabricated.
 */
export function computePortfolioChange24hPercent(
  assets: MockAsset[],
  prices: MarketPrices | null,
): number | null {
  if (!prices) {
    return null;
  }

  let currentTotal = 0;
  let priorTotal = 0;

  for (const asset of assets) {
    const priceEntry = getPriceEntry(asset.symbol, prices);

    if (!priceEntry) {
      return null;
    }

    const currentValue =
      asset.quantity * priceEntry.priceChf;
    const changePercent =
      priceEntry.change24hPercent ?? 0;

    currentTotal += currentValue;
    priorTotal += currentValue / (1 + changePercent / 100);
  }

  if (priorTotal === 0) {
    return null;
  }

  return ((currentTotal - priorTotal) / priorTotal) * 100;
}
