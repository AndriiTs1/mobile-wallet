import { Image } from 'react-native';

import type { CoinSymbol } from '@/constants/mock-portfolio';

const ICONS: Record<CoinSymbol, number> = {
  BTC: require('@/assets/images/coinIcons/btc.png'),
  ETH: require('@/assets/images/coinIcons/eth.png'),
  USDC: require('@/assets/images/coinIcons/usdc.png'),
  USDT: require('@/assets/images/coinIcons/usdt.png'),
};

type CoinBadgeProps = {
  symbol: CoinSymbol;
  size?: number;
};

export function CoinBadge({ symbol, size = 33 }: CoinBadgeProps) {
  return <Image source={ICONS[symbol]} style={{ width: size, height: size }} resizeMode="contain" />;
}
