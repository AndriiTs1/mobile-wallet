import { StyleSheet, Text, View } from 'react-native';

import { CoinBadge } from '@/components/coin-badge';
import { Colors, Spacing } from '@/constants/theme';
import type { CoinSymbol } from '@/constants/mock-portfolio';

const palette = Colors.dark;

export type AssetRowProps = {
  symbol: CoinSymbol;
  name: string;
  amountLabel: string;
  valueLabel: string;
  changeLabel: string;
  /** null = no live/mock verdict yet (neutral placeholder), not a fabricated sign. */
  isPositive: boolean | null;
};

export function AssetRow({ symbol, name, amountLabel, valueLabel, changeLabel, isPositive }: AssetRowProps) {
  const changeColor =
    isPositive === null ? palette.textSecondary : isPositive ? palette.positive : palette.negative;

  return (
    <View style={styles.row}>
      <View style={styles.identity}>
        <CoinBadge symbol={symbol} />
        <View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.symbol}>{symbol}</Text>
        </View>
      </View>

      <View style={styles.figures}>
        <Text style={styles.amount}>{amountLabel}</Text>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{valueLabel}</Text>
          <Text style={[styles.change, { color: changeColor }]}>{changeLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.backgroundElement,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  name: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  symbol: {
    color: palette.textSecondary,
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1,
  },
  figures: {
    alignItems: 'flex-end',
  },
  amount: {
    color: palette.text,
    fontSize: 13.5,
    fontWeight: '600',
  },
  valueRow: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginTop: 2,
  },
  value: {
    color: palette.textSecondary,
    fontSize: 11.5,
    fontWeight: '500',
  },
  change: {
    fontSize: 11.5,
    fontWeight: '600',
  },
});
