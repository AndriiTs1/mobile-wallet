import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

const SETTINGS_ROWS = ['Security', 'Preferences', 'Currency', 'About'] as const;

export default function SettingsScreen() {
  return (
    <ScreenScaffold>
      <ScreenHeader title="Settings" />

      <View style={styles.list}>
        {SETTINGS_ROWS.map((label, index) => (
          <View
            key={label}
            style={[styles.row, index === SETTINGS_ROWS.length - 1 && styles.rowLast]}>
            <Text style={styles.rowLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.footnote}>Preview scaffolding — not yet functional.</Text>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: Spacing.five,
    backgroundColor: palette.backgroundElement,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '500',
  },
  footnote: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: Spacing.four,
    textAlign: 'center',
  },
});
