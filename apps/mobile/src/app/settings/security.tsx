import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SettingsCard, SettingsRow } from '@/components/settings-row';
import { Spacing } from '@/constants/theme';
import { presentBackupPhrase } from '@/services/wallet-core-bridge';

export default function SecuritySettingsScreen() {
  // Stage 5E.7C — TEMPORARY QA-only wiring. Presents the existing native
  // backup-phrase screen for the wallet that already exists on this
  // device, purely so it can be visually inspected on a physical iPhone.
  // This is NOT the real Recovery & Backup reveal flow: there is no Face
  // ID/device-authentication gate, no backupConfirmed tracking, and no
  // "why am I being shown this" framing — it will be replaced by the real,
  // gated reveal flow in a later stage. `presentBackupPhrase()` is the
  // same secret-free Expo function onboarding already uses (Stage 5E.4):
  // it takes no argument, resolves with no value, and no wallet secret
  // ever crosses into RN/JS — WalletBackupPhraseView reconstructs and
  // renders it entirely natively. This handler never calls any wallet
  // create/persist/delete API, so it cannot create a second wallet or
  // touch the existing one's stored data.
  const handleRecoveryAndBackupPress = async () => {
    try {
      await presentBackupPhrase();
    } catch {
      // Generic, UI-safe only — never logs or surfaces the caught error's
      // internal detail. Temporary QA wiring has no error UI of its own;
      // a silent no-op on failure is acceptable for this stage.
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
