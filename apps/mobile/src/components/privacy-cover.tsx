import { StyleSheet, View } from 'react-native';

import { ShieldMark } from '@/components/shield-mark';
import { Colors, ShieldLogoSize } from '@/constants/theme';

const palette = Colors.dark;

/**
 * Stage 5F.5B — iOS app-switcher (multitasking snapshot) privacy cover.
 *
 * Purely presentational: no props, no wallet state, no auth logic, no
 * persistence. Mounted by `AppLockGate` (`_layout.tsx`) as an additional
 * layer ON TOP of whatever it is already rendering (protected content or
 * its own lock screen), whenever the app has left the foreground —
 * covering the OS's app-switcher snapshot, never anything else.
 *
 * EXPLICITLY NOT a security/authentication boundary: whatever is mounted
 * underneath this cover remains fully mounted and running the entire time
 * it is shown. This component's only purpose is controlling what pixels
 * iOS captures for the multitasking thumbnail — the real security gate
 * remains `AppLockGate`'s structural render-tree gating (Stage 5F.4/5F.5A),
 * entirely unaffected by this component's presence or absence.
 *
 * Shows nothing wallet-specific by construction: no balance, address,
 * activity, asset, or recovery-related content, no text, no spinner — just
 * the same `ShieldMark` brand mark already used by `AppLockScreen`, on the
 * same dark background, so any hand-off between the two is visually
 * seamless.
 */
export function PrivacyCover() {
  return (
    <View style={styles.container} pointerEvents="none">
      <ShieldMark size={ShieldLogoSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
