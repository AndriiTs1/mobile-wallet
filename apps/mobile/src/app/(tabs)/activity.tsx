import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { TransactionRow } from '@/components/transaction-row';
import { Colors, Spacing } from '@/constants/theme';

import {
  fetchWalletActivity,
  type WalletActivitySnapshot,
} from '@/services/wallet-activity-aggregator';

import type { WalletActivityItem } from '@/services/wallet-activity';

const palette = Colors.dark;

type ActivityState =
  | {
      status: 'loading';
    }
  | {
      status: 'ready';
      snapshot: WalletActivitySnapshot;
    }
  | {
      status: 'error';
    };

type ActivityGroup = {
  readonly key: string;
  readonly label: string;
  readonly items: readonly WalletActivityItem[];
};

function dayKey(timestampMs: number): string {
  const date = new Date(timestampMs);

  return [
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ].join('-');
}

function groupLabel(
  timestampMs: number | null,
): string {
  if (timestampMs === null) {
    return 'Pending';
  }

  const date = new Date(timestampMs);
  const today = new Date();

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (
    dayKey(timestampMs) ===
    dayKey(today.getTime())
  ) {
    return 'Today';
  }

  if (
    dayKey(timestampMs) ===
    dayKey(yesterday.getTime())
  ) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    year:
      date.getFullYear() ===
      today.getFullYear()
        ? undefined
        : 'numeric',
  });
}

function groupActivity(
  items: readonly WalletActivityItem[],
): ActivityGroup[] {
  const groups = new Map<
    string,
    WalletActivityItem[]
  >();

  for (const item of items) {
    const label =
      groupLabel(item.timestampMs);

    const existing =
      groups.get(label) ?? [];

    existing.push(item);
    groups.set(label, existing);
  }

  return [...groups.entries()].map(
    ([label, groupItems]) => ({
      key: label,
      label,
      items: groupItems,
    }),
  );
}

export default function ActivityScreen() {
  const [state, setState] =
    useState<ActivityState>({
      status: 'loading',
    });

  const load = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const snapshot =
        await fetchWalletActivity();

      setState({
        status: 'ready',
        snapshot,
      });
    } catch {
      setState({
        status: 'error',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScreenScaffold
      header={<ScreenHeader title="Activity" />}>
      {state.status === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator
            size="small"
            color={palette.text}
          />

          <Text style={styles.stateText}>
            Loading activity…
          </Text>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>
            Activity unavailable
          </Text>

          <Text style={styles.stateText}>
            Couldn’t load your transaction history.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading activity"
            onPress={() => void load()}
            style={({ pressed }) => [
              styles.retryButton,
              pressed &&
                styles.retryButtonPressed,
            ]}>
            <Text style={styles.retryLabel}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : null}

      {state.status === 'ready' ? (
        <>
          {state.snapshot.bitcoin ===
            'unavailable' ||
          state.snapshot.ethereum ===
            'unavailable' ? (
            <View style={styles.warningPanel}>
              <Text style={styles.warningText}>
                Some network activity is temporarily
                unavailable.
              </Text>
            </View>
          ) : null}

          {state.snapshot.items.length === 0 ? (
            <View style={styles.centerState}>
              <Text style={styles.stateTitle}>
                No activity yet
              </Text>

              <Text style={styles.stateText}>
                Your transactions will appear here.
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh activity"
                onPress={() => void load()}
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed &&
                    styles.retryButtonPressed,
                ]}>
                <Text style={styles.retryLabel}>
                  Refresh
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.list}>
              {groupActivity(
                state.snapshot.items,
              ).map((group) => (
                <View
                  key={group.key}
                  style={styles.group}>
                  <Text
                    style={styles.groupLabel}>
                    {group.label}
                  </Text>

                  <View
                    style={styles.groupList}>
                    {group.items.map(
                      (transaction) => (
                        <TransactionRow
                          key={transaction.id}
                          transaction={
                            transaction
                          }
                        />
                      ),
                    )}
                  </View>
                </View>
              ))}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh activity"
                onPress={() => void load()}
                style={({ pressed }) => [
                  styles.refreshButton,
                  pressed &&
                    styles.retryButtonPressed,
                ]}>
                <Text style={styles.refreshLabel}>
                  Refresh
                </Text>
              </Pressable>
            </View>
          )}
        </>
      ) : null}
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

  centerState: {
    marginTop: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },

  stateTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },

  stateText: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },

  retryButton: {
    marginTop: Spacing.two,
    minWidth: 110,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: palette.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },

  retryButtonPressed: {
    opacity: 0.8,
  },

  retryLabel: {
    color: palette.background,
    fontSize: 14,
    fontWeight: '700',
  },

  warningPanel: {
    marginTop: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    backgroundColor: palette.backgroundElement,
  },

  warningText: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },

  refreshButton: {
    alignSelf: 'center',
    minHeight: 40,
    paddingHorizontal: Spacing.four,
    borderRadius: 12,
    backgroundColor: palette.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },

  refreshLabel: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
