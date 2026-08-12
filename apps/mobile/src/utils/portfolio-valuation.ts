import type { MockAsset } from '@/constants/mock-portfolio';
import type { MarketPrices } from '@/services/market-data';

export const VALUE_PLACEHOLDER = '—';

export function formatChf(amountChf: number): string {
  return `CHF ${amountChf.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatChangePercent(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

export function computeAssetValueChf(asset: MockAsset, prices: MarketPrices | null): number | null {
  const priceEntry = prices?.[asset.symbol] ?? null;
  return priceEntry ? asset.quantity * priceEntry.priceChf : null;
}

export function computeAssetChange24hPercent(asset: MockAsset, prices: MarketPrices | null): number | null {
  const priceEntry = prices?.[asset.symbol] ?? null;
  return priceEntry ? priceEntry.change24hPercent : null;
}

/** null = unavailable (neutral placeholder), never a fabricated sign. */
export function toPositiveFlag(value: number | null): boolean | null {
  return value !== null ? value >= 0 : null;
}

export function computeTotalValueChf(assets: MockAsset[], prices: MarketPrices | null): number | null {
  if (!prices) {
    return null;
  }
  return assets.reduce((sum, asset) => sum + asset.quantity * prices[asset.symbol].priceChf, 0);
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
    const priceEntry = prices[asset.symbol];
    const currentValue = asset.quantity * priceEntry.priceChf;
    const changePercent = priceEntry.change24hPercent ?? 0;

    currentTotal += currentValue;
    priorTotal += currentValue / (1 + changePercent / 100);
  }

  if (priorTotal === 0) {
    return null;
  }

  return ((currentTotal - priorTotal) / priorTotal) * 100;
}
