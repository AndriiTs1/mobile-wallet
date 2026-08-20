import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SettingsCard, SettingsRow } from '@/components/settings-row';
import { Spacing } from '@/constants/theme';
import { requestRevealBackup } from '@/services/wallet-core-bridge';

export default function SecuritySettingsScreen() {
  // Stage 5F.3 — the real, gated Recovery & Backup reveal flow. Native
  // device-owner authentication (Face ID/Touch ID/passcode fallback) must
  // succeed BEFORE the recovery phrase is ever reconstructed or presented
  // — see `WalletBackupPhrasePresenter.presentGatedReveal()`'s own doc
  // comment. `requestRevealBackup()` takes no argument and resolves with
  // no value; no wallet secret, and no authentication result/token, ever
  // crosses into RN/JS in either direction. This handler never calls any
  // wallet create/persist/delete API, so it cannot create a second wallet
  // or touch the existing one's stored data.
  const handleRecoveryAndBackupPress = async () => {
    try {
      await requestRevealBackup();
    } catch {
      // Generic, UI-safe only — never logs or surfaces the caught error's
      // internal detail (which itself never carries OS/authentication
      // detail to begin with — see the native authorizer's own error
      // boundary). Cancelling or failing authentication simply leaves the
      // user on this screen with no visible change, which is the correct,
      // safe outcome — there is nothing to navigate away from or clean up.
    }
  };

  return (
    <ScreenScaffold header={<ScreenHeader title="Security" back />}>
      <View style={styles.sections}>
        <SettingsCard>
          <SettingsRow label="App Lock" indicator="chevron" />
          <SettingsRow label="Biometrics / Face ID" indicator="chevron" />
          <Pressable
            onPress={handleRecoveryAndBackupPress}
            accessibilityRole="button"
            accessibilityLabel="Recovery & Backup">
            <SettingsRow label="Recovery & Backup" indicator="chevron" isLast />
          </Pressable>
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
