import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SettingsCard, SettingsRow } from '@/components/settings-row';
import { Spacing } from '@/constants/theme';

export default function PreferencesSettingsScreen() {
  return (
    <ScreenScaffold header={<ScreenHeader title="Preferences" back />}>
      <View style={styles.sections}>
        <SettingsCard>
          <SettingsRow label="Notifications" indicator="chevron" />
          <SettingsRow label="Appearance" trailingText="Dark" indicator="chevron" isLast />
        </SettingsCard>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  sections: {
    marginTop: Spacing.five,
  },
});
