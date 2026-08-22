import type { AtomicAmount } from 'chain-domain';
import { formatAtomicAmountDecimal } from 'chain-domain';

export type DisplayAssetSymbol =
  | 'BTC'
  | 'ETH'
  | 'USDC'
  | 'USDT'
  | 'XAUT';

const MAX_DISPLAY_DECIMALS: Record<DisplayAssetSymbol, number> = {
  BTC: 8,
  ETH: 8,
  USDC: 6,
  USDT: 6,
  XAUT: 6,
};

const DISPLAY_SYMBOL: Record<DisplayAssetSymbol, string> = {
  BTC: 'BTC',
  ETH: 'ETH',
  USDC: 'USDC',
  USDT: 'USDT',
  XAUT: 'XAU₮',
};

/**
 * Presentation-only formatter.
 *
 * The underlying AtomicAmount is never changed or rounded.
 * Only the decimal string shown to the user is shortened.
 */
export function formatAtomicAssetAmountForDisplay(
  amount: AtomicAmount,
  assetDecimals: number,
  symbol: DisplayAssetSymbol,
): string {
  const exact = formatAtomicAmountDecimal(
    amount,
    assetDecimals,
  );

  const [whole, fraction = ''] = exact.split('.');
  const maxDecimals = MAX_DISPLAY_DECIMALS[symbol];

  const visibleFraction = fraction
    .slice(0, maxDecimals)
    .replace(/0+$/, '');

  const visibleAmount =
    visibleFraction.length > 0
      ? `${whole}.${visibleFraction}`
      : whole;

  return `${visibleAmount} ${DISPLAY_SYMBOL[symbol]}`;
}
