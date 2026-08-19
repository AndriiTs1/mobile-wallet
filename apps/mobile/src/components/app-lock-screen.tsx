import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ShieldMark } from '@/components/shield-mark';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

type AppLockScreenProps = {
  isAuthenticating: boolean;
  onRetry: () => void;
};

/**
 * Stage 5F.4B — minimal presentational lock/retry screen shown by
 * `AppLockGate` (`_layout.tsx`) whenever an existing wallet's cold-launch
 * authentication is pending or has failed. Purely presentational: owns no
 * authentication state itself, never calls `requestAppUnlock()` directly —
 * `onRetry` is the only way this component can trigger a (fresh) attempt,
 * and that decision belongs entirely to the caller.
 *
 * Deliberately shows nothing wallet-specific: no balance, address,
 * wallet/account name, asset, or recovery-related content, and no
 * authentication-failure-type or OS error detail — a generic message only,
 * consistent with ADR-005 §9 ("the lock screen itself must not leak account
 * state") and this stage's own explicit UX requirement.
 */
export function AppLockScreen({ isAuthenticating, onRetry }: AppLockScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ShieldMark size={40} />
        <Text style={styles.title}>Unlock Mobile Wallet</Text>
        {isAuthenticating ? (
          <ActivityIndicator size="small" color={palette.accentGold} style={styles.spinner} />
        ) : (
          <>
            <Text style={styles.message}>Authentication was cancelled or unsuccessful.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try Again"
              onPress={onRetry}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}>
              <Text style={styles.retryButtonLabel}>Try Again</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  message: {
    color: palette.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
  spinner: {
    marginTop: Spacing.two,
  },
  retryButton: {
    marginTop: Spacing.two,
    backgroundColor: palette.accentGold,
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  retryButtonPressed: {
    opacity: 0.7,
  },
  retryButtonLabel: {
    color: palette.background,
    fontSize: 15,
    fontWeight: '700',
  },
});
