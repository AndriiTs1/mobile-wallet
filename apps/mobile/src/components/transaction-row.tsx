import { SymbolView, type SFSymbol } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import type { MockTransaction, TransactionType } from '@/constants/mock-activity';

const palette = Colors.dark;

const TYPE_META: Record<TransactionType, { label: string; symbol: SFSymbol; glyph: string; tint: string }> = {
  received: { label: 'Received', symbol: 'arrow.down', glyph: '↓', tint: palette.positive },
  sent: { label: 'Sent', symbol: 'arrow.up', glyph: '↑', tint: palette.negative },
  swap: { label: 'Swap', symbol: 'arrow.left.arrow.right', glyph: '⇄', tint: palette.text },
  buy: { label: 'Buy', symbol: 'plus', glyph: '+', tint: palette.text },
};

type TransactionRowProps = {
  transaction: MockTransaction;
};

export function TransactionRow({ transaction }: TransactionRowProps) {
  const meta = TYPE_META[transaction.type];
  const pairLabel =
    transaction.type === 'swap' && transaction.secondarySymbol
      ? `${transaction.primarySymbol} → ${transaction.secondarySymbol}`
      : transaction.primarySymbol;

  return (
    <View style={styles.row}>
      <View style={styles.identity}>
        <View style={styles.iconCircle}>
          <SymbolView
            name={{ ios: meta.symbol }}
            size={16}
            tintColor={meta.tint}
            fallback={<Text style={[styles.iconGlyphFallback, { color: meta.tint }]}>{meta.glyph}</Text>}
          />
        </View>
        <View>
          <Text style={styles.type}>{meta.label}</Text>
          <Text style={styles.pair}>{pairLabel}</Text>
        </View>
      </View>

      <View style={styles.figures}>
        <Text style={[styles.amount, { color: meta.tint }]}>{transaction.amountLabel}</Text>
        <Text style={styles.value}>{transaction.valueLabel}</Text>
        <Text style={styles.meta}>{transaction.timeLabel} · Completed</Text>
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
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyphFallback: {
    fontSize: 15,
    fontWeight: '700',
  },
  type: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pair: {
    color: palette.textSecondary,
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1,
  },
  figures: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  value: {
    color: palette.textSecondary,
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
  meta: {
    color: palette.textSecondary,
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 2,
    opacity: 0.8,
  },
});
