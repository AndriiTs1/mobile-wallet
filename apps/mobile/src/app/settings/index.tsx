import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SettingsCard, SettingsCategoryRow } from '@/components/settings-row';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

type SettingsCategory = {
  href: '/settings/security' | '/settings/preferences' | '/settings/currency' | '/settings/about';
  label: string;
  subtitle: string;
};

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { href: '/settings/security', label: 'Security', subtitle: 'App Lock, biometrics & recovery' },
  { href: '/settings/preferences', label: 'Preferences', subtitle: 'Notifications & appearance' },
  { href: '/settings/currency', label: 'Currency', subtitle: 'CHF · Display preferences' },
  { href: '/settings/about', label: 'About', subtitle: 'Network, version & legal' },
];

export default function SettingsScreen() {
  return (
    <ScreenScaffold header={<ScreenHeader title="Settings" />}>
      <View style={styles.sections}>
        <SettingsCard>
          {SETTINGS_CATEGORIES.map((category, index) => (
            <SettingsCategoryRow
              key={category.href}
              href={category.href}
              label={category.label}
              subtitle={category.subtitle}
              isLast={index === SETTINGS_CATEGORIES.length - 1}
            />
          ))}
        </SettingsCard>
      </View>

      <Text style={styles.footnote}>Settings are for preview — nothing is saved yet.</Text>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  sections: {
    marginTop: Spacing.four,
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
