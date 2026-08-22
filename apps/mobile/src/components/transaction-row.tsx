import { SymbolView, type SFSymbol } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { CoinBadge } from '@/components/coin-badge';
import { Colors, Spacing } from '@/constants/theme';
import type { WalletActivityItem } from '@/services/wallet-activity';

const palette = Colors.dark;

type TransactionRowProps = {
  transaction: WalletActivityItem;
};

function displaySymbol(
  symbol: WalletActivityItem['asset'],
): string {
  return symbol === 'XAUT' ? 'XAU₮' : symbol;
}

function statusLabel(
  status: WalletActivityItem['status'],
): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    case 'confirmed':
      return 'Completed';
  }
}

function formatTime(timestampMs: number | null): string {
  if (timestampMs === null) {
    return 'Awaiting confirmation';
  }

  const date = new Date(timestampMs);
  const now = new Date();

  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
  });
}

export function TransactionRow({
  transaction,
}: TransactionRowProps) {
  const isReceived =
    transaction.direction === 'received';

  const label =
    isReceived ? 'Received' : 'Sent';

  const symbol: SFSymbol =
    isReceived ? 'arrow.down' : 'arrow.up';

  const glyph =
    isReceived ? '↓' : '↑';

  const tint =
    isReceived
      ? palette.positive
      : palette.negative;

  const amountSign =
    isReceived ? '+' : '-';

  const status = statusLabel(transaction.status);

  return (
    <View style={styles.row}>
      <View style={styles.identity}>
        <View style={styles.coinWrap}>
          <CoinBadge
            symbol={transaction.asset}
            size={34}
          />

          <View style={styles.directionBadge}>
            <SymbolView
              name={{ ios: symbol }}
              size={10}
              tintColor={tint}
              fallback={
                <Text
                  style={[
                    styles.directionFallback,
                    { color: tint },
                  ]}>
                  {glyph}
                </Text>
              }
            />
          </View>
        </View>

        <View style={styles.identityText}>
          <Text style={styles.type}>
            {label}
          </Text>

          <Text style={styles.pair}>
            {displaySymbol(transaction.asset)}
            {' · '}
            {transaction.network ===
            'bitcoin-mainnet'
              ? 'Bitcoin'
              : 'Ethereum'}
          </Text>
        </View>
      </View>

      <View style={styles.figures}>
        <Text
          style={[
            styles.amount,
            { color: tint },
          ]}>
          {amountSign}
          {Number(transaction.amount).toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}{' '}
          {displaySymbol(transaction.asset)}
        </Text>

        <Text
          style={[
            styles.meta,
            transaction.status === 'failed' &&
              styles.failed,
          ]}>
          {formatTime(transaction.timestampMs)}
          {' · '}
          {status}
        </Text>
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
    gap: Spacing.two,
  },

  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
    minWidth: 0,
  },

  coinWrap: {
    position: 'relative',
  },

  directionBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  directionFallback: {
    fontSize: 10,
    fontWeight: '800',
  },

  identityText: {
    flexShrink: 1,
    minWidth: 0,
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
    flexShrink: 1,
    maxWidth: '62%',
  },

  amount: {
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'right',
  },

  meta: {
    color: palette.textSecondary,
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 3,
    opacity: 0.85,
  },

  failed: {
    color: palette.negative,
    opacity: 1,
  },
});
