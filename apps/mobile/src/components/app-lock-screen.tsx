import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ShieldMark } from '@/components/shield-mark';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

/**
 * 'holding' — Stage 5F.4C's initial cold-launch hold: shield/logo on the
 *   dark background ONLY, nothing else, matching the desired
 *   splash-to-Face-ID visual continuity.
 * 'authenticating' — a `requestAppUnlock()` call is in flight.
 * 'error' — the most recent attempt failed/was cancelled; retry offered.
 */
type AppLockScreenVariant = 'holding' | 'authenticating' | 'error';

type AppLockScreenProps = {
  variant: AppLockScreenVariant;
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
 *
 * Stage 5F.4C: the same single `ShieldMark` render site is reused across
 * all three variants. Both `holding` and `authenticating` render only the
 * shield; the title/message/retry controls appear only after an
 * authentication error or cancellation.
 */
export function AppLockScreen({ variant, onRetry }: AppLockScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ShieldMark size={40} />
        {variant === 'error' ? (
          <>
            <Text style={styles.title}>Unlock Mobile Wallet</Text>
            <Text style={styles.message}>Authentication was cancelled or unsuccessful.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try Again"
              onPress={onRetry}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}>
              <Text style={styles.retryButtonLabel}>Try Again</Text>
            </Pressable>
          </>
        ) : null}
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
