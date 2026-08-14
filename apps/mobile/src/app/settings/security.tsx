import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SettingsCard, SettingsRow } from '@/components/settings-row';
import { Spacing } from '@/constants/theme';

export default function SecuritySettingsScreen() {
  return (
    <ScreenScaffold header={<ScreenHeader title="Security" back />}>
      <View style={styles.sections}>
        <SettingsCard>
          <SettingsRow label="App Lock" indicator="chevron" />
          <SettingsRow label="Biometrics / Face ID" indicator="chevron" />
          <SettingsRow label="Recovery & Backup" indicator="chevron" isLast />
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
