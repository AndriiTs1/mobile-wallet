import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

type SettingsRowIndicator = 'chevron' | 'check' | 'none';

type SettingsRow = {
  label: string;
  trailingText?: string;
  indicator: SettingsRowIndicator;
};

type SettingsSection = {
  title: string;
  rows: SettingsRow[];
};

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    title: 'Security',
    rows: [
      { label: 'App Lock', indicator: 'chevron' },
      { label: 'Biometrics / Face ID', indicator: 'chevron' },
      { label: 'Recovery & Backup', indicator: 'chevron' },
    ],
  },
  {
    title: 'Preferences',
    rows: [
      { label: 'Notifications', indicator: 'chevron' },
      { label: 'Appearance', trailingText: 'Dark', indicator: 'chevron' },
    ],
  },
  {
    title: 'Currency',
    rows: [
      { label: 'Base Currency', trailingText: 'CHF', indicator: 'chevron' },
      { label: 'Show CHF as the current value', indicator: 'check' },
    ],
  },
  {
    title: 'About',
    rows: [
      { label: 'Network', indicator: 'chevron' },
      { label: 'App Version', trailingText: '1.0.0', indicator: 'none' },
      { label: 'Privacy & Legal', indicator: 'chevron' },
    ],
  },
];

export default function SettingsScreen() {
  return (
    <ScreenScaffold>
      <ScreenHeader title="Settings" />

      <View style={styles.sections}>
        {SETTINGS_SECTIONS.map((section) => (
          <View key={section.title}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            <View style={styles.card}>
              {section.rows.map((row, index) => (
                <View
                  key={row.label}
                  style={[styles.row, index === section.rows.length - 1 && styles.rowLast]}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <View style={styles.rowTrailing}>
                    {row.trailingText ? (
                      <Text style={styles.rowTrailingText}>{row.trailingText}</Text>
                    ) : null}
                    {row.indicator === 'chevron' && (
                      <SymbolView
                        name={{ ios: 'chevron.right' }}
                        size={13}
                        tintColor={palette.textSecondary}
                        fallback={<Text style={styles.chevronFallback}>›</Text>}
                      />
                    )}
                    {row.indicator === 'check' && (
                      <SymbolView
                        name={{ ios: 'checkmark' }}
                        size={15}
                        tintColor={palette.accentGold}
                        fallback={<Text style={styles.checkFallback}>✓</Text>}
                      />
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.footnote}>Settings are for preview — nothing is saved yet.</Text>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  sections: {
    marginTop: Spacing.five,
    gap: Spacing.four,
  },
  sectionLabel: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.two,
  },
  card: {
    backgroundColor: palette.backgroundElement,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    flexShrink: 1,
    marginRight: Spacing.two,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  rowTrailingText: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  chevronFallback: {
    color: palette.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  checkFallback: {
    color: palette.accentGold,
    fontSize: 14,
    fontWeight: '700',
  },
  footnote: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: Spacing.four,
    marginBottom: Spacing.four,
    textAlign: 'center',
  },
});
