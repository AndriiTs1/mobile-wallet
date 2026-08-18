import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

/**
 * Stage 5A native/Rust boundary proof — NOT a wallet.
 *
 * Proves: React Native → Expo native module (Swift, iOS) → UniFFI-generated
 * bindings → Rust `wallet-core` crate → deterministic non-sensitive
 * response → back to React Native. No key material, no crypto, no
 * signing, no storage, no network exist anywhere on this path.
 *
 * Rendered only in development builds (`__DEV__`) — temporary diagnostic
 * scaffolding for the bridge proof, not a shipped product surface.
 */

type WalletCoreBridgeApi = {
  getVersion(): string;
  healthCheck(): string;
};

/**
 * Deliberately a deferred `require(...)` inside a function, not a static
 * top-level `import`. `WalletCoreBridgeModule.ts` calls
 * `requireNativeModule(...)` as a module-evaluation side effect, which
 * throws if the native module isn't linked into this runtime (e.g. Expo
 * Go, which cannot load custom native modules at all). A static `import`
 * is hoisted and evaluated before this component's own code ever runs, so
 * wrapping only the later `.getVersion()`/`.healthCheck()` calls in
 * try/catch would NOT catch that throw. Deferring the `require` into this
 * function, itself called from inside try/catch, is what actually makes
 * the "native module unavailable" case fail safely instead of crashing.
 */
function loadWalletCoreBridge(): WalletCoreBridgeApi | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../../modules/wallet-core-bridge/src/WalletCoreBridgeModule');
    return (mod.default ?? mod) as WalletCoreBridgeApi;
  } catch {
    return null;
  }
}

type ProofResult =
  | { status: 'ready'; version: string; health: string }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

export function WalletCoreProof() {
  const result = useMemo<ProofResult>(() => {
    const bridge = loadWalletCoreBridge();
    if (!bridge) {
      return { status: 'unavailable' };
    }
    try {
      return { status: 'ready', version: bridge.getVersion(), health: bridge.healthCheck() };
    } catch (error) {
      return { status: 'error', message: (error as Error).message };
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DEV PROOF — Stage 5A</Text>
      <Text style={styles.subtitle}>Native/Rust bridge · not a wallet</Text>

      {result.status === 'ready' ? (
        <>
          <Text style={styles.row}>
            Version: <Text style={styles.mono}>{result.version}</Text>
          </Text>
          <Text style={styles.row}>
            Health: <Text style={styles.mono}>{result.health}</Text>
          </Text>
        </>
      ) : result.status === 'unavailable' ? (
        <Text style={styles.statusError}>
          Native Wallet Core module unavailable in this runtime (expected in Expo Go or web — this
          module requires a custom development build).
        </Text>
      ) : (
        <Text style={styles.statusError}>Wallet Core call failed: {result.message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.accentGold,
    gap: Spacing.one,
  },
  title: {
    color: palette.accentGold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginBottom: Spacing.one,
  },
  row: {
    color: palette.textSecondary,
    fontSize: 12,
  },
  mono: {
    color: palette.text,
    fontFamily: 'ui-monospace',
    fontSize: 12,
  },
  statusError: {
    color: palette.negative,
    fontSize: 12,
    marginTop: Spacing.one,
  },
});
