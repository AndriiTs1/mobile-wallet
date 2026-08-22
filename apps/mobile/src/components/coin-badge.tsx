import { Image, StyleSheet, Text, View } from 'react-native';

import type { CoinSymbol } from '@/constants/mock-portfolio';
import { Colors } from '@/constants/theme';

const palette = Colors.dark;

const ICONS: Partial<Record<CoinSymbol, number>> = {
  BTC: require('@/assets/images/coinIcons/btc.png'),
  ETH: require('@/assets/images/coinIcons/eth.png'),
  USDC: require('@/assets/images/coinIcons/usdc.png'),
  USDT: require('@/assets/images/coinIcons/usdt.png'),
};

type CoinBadgeProps = {
  symbol: CoinSymbol;
  size?: number;
};

export function CoinBadge({
  symbol,
  size = 33,
}: CoinBadgeProps) {
  const icon = ICONS[symbol];

  if (icon) {
    return (
      <Image
        source={icon}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}>
      <Text
        style={[
          styles.fallbackText,
          { fontSize: Math.max(10, size * 0.3) },
        ]}>
        {symbol === 'GOLD' ? 'Au' : '€'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.backgroundElement,
    borderWidth: 1,
    borderColor: palette.border,
  },

  fallbackText: {
    color: palette.text,
    fontWeight: '800',
  },
});
