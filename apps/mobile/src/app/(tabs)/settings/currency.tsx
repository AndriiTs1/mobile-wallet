import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SettingsCard, SettingsRow } from '@/components/settings-row';
import { Spacing } from '@/constants/theme';

export default function CurrencySettingsScreen() {
  return (
    <ScreenScaffold header={<ScreenHeader title="Currency" back />}>
      <View style={styles.sections}>
        <SettingsCard>
          <SettingsRow label="Base Currency" trailingText="CHF" indicator="chevron" />
          <SettingsRow label="Show CHF as the current value" indicator="check" isLast />
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
