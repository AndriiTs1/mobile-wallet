import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SettingsCard, SettingsRow } from '@/components/settings-row';
import { Spacing } from '@/constants/theme';

export default function AboutSettingsScreen() {
  return (
    <ScreenScaffold header={<ScreenHeader title="About" back />}>
      <View style={styles.sections}>
        <SettingsCard>
          <SettingsRow label="Network" indicator="chevron" />
          <SettingsRow label="App Version" trailingText="1.0.0" indicator="none" />
          <SettingsRow label="Privacy & Legal" indicator="chevron" isLast />
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
