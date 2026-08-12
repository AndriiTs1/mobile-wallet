import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

export default function ActivityScreen() {
  return (
    <ScreenScaffold>
      <ScreenHeader title="Activity" />

      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconGlyph}>↻</Text>
        </View>
        <Text style={styles.emptyTitle}>No activity yet</Text>
        <Text style={styles.emptyBody}>
          Transactions will appear here once this wallet is connected to a network.
        </Text>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    marginTop: Spacing.six,
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.backgroundElement,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  emptyIconGlyph: {
    color: palette.textSecondary,
    fontSize: 22,
    fontWeight: '600',
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyBody: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 19,
  },
});
