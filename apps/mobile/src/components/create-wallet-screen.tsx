import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ShieldMark } from '@/components/shield-mark';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

type CreateWalletScreenProps = {
  isCreating: boolean;
  errorMessage: string | null;
  onCreate: () => void;
};

/**
 * Stage 5E.6 — the smallest real first-run screen: branding, a short
 * trust-focused description, and a single "Create Wallet" action. No
 * Import affordance is included — this stage's layout doesn't need one for
 * visual balance, and adding a non-functional button was judged more
 * likely to read as broken than as a deliberate placeholder.
 *
 * Purely presentational: all state (checking/noWallet/creating/
 * walletExists/error) lives in the root layout that renders this screen.
 */
export function CreateWalletScreen({ isCreating, errorMessage, onCreate }: CreateWalletScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.brandBlock}>
        <ShieldMark size={64} />
        <Text style={styles.title}>SwissWallet</Text>
        <Text style={styles.subtitle}>
          Your keys, your wallet. Created and secured entirely on your device — nothing is ever
          sent to us.
        </Text>
      </View>

      <View style={styles.actionBlock}>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isCreating, busy: isCreating }}
          disabled={isCreating}
          onPress={onCreate}
          style={({ pressed }) => [
            styles.createButton,
            (pressed || isCreating) && styles.createButtonPressed,
          ]}>
          <Text style={styles.createButtonLabel}>{isCreating ? 'Creating…' : 'Create Wallet'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  brandBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  actionBlock: {
    width: '100%',
    gap: Spacing.two,
  },
  errorText: {
    color: palette.negative,
    fontSize: 13,
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: palette.accentGold,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  createButtonPressed: {
    opacity: 0.7,
  },
  createButtonLabel: {
    color: palette.background,
    fontSize: 16,
    fontWeight: '700',
  },
});
