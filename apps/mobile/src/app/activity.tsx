import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { TransactionRow } from '@/components/transaction-row';
import { Colors, Spacing } from '@/constants/theme';
import { mockTransactions, type TransactionGroup } from '@/constants/mock-activity';

const palette = Colors.dark;

const GROUP_ORDER: TransactionGroup[] = ['Today', 'Yesterday', 'Earlier'];

export default function ActivityScreen() {
  return (
    <ScreenScaffold>
      <ScreenHeader title="Activity" />

      <View style={styles.list}>
        {GROUP_ORDER.map((group) => {
          const transactions = mockTransactions.filter((transaction) => transaction.group === group);
          if (transactions.length === 0) {
            return null;
          }

          return (
            <View key={group} style={styles.group}>
              <Text style={styles.groupLabel}>{group}</Text>
              <View style={styles.groupList}>
                {transactions.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </View>
            </View>
          );
        })}
      </View>

      <Text style={styles.footnote}>Demo transaction history — not connected to a wallet.</Text>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: Spacing.four,
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.two,
  },
  groupLabel: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  groupList: {
    gap: Spacing.two,
  },
  footnote: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: Spacing.four,
    textAlign: 'center',
  },
});
