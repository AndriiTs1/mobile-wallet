import { Image, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

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

  if (symbol === 'XAUT') {
    return (
      <View
        style={[
          styles.goldBadge,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}>
        <SymbolView
          name={{ ios: 'cube.fill' }}
          size={size * 0.44}
          tintColor={palette.accentGold}
          fallback={
            <Text
              style={[
                styles.goldFallback,
                { fontSize: Math.max(10, size * 0.28) },
              ]}>
              Au
            </Text>
          }
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  goldBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.backgroundElement,
    borderWidth: 1.5,
    borderColor: palette.accentGold,
  },

  goldFallback: {
    color: palette.accentGold,
    fontWeight: '800',
  },
});
