import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { CreateWalletScreen } from '@/components/create-wallet-screen';
import { Colors } from '@/constants/theme';
import { MarketDataProvider } from '@/providers/market-data-provider';
import { createWalletAndPresentBackup, hasWallet } from '@/services/wallet-core-bridge';

SplashScreen.preventAutoHideAsync();

const palette = Colors.dark;

const GENERIC_CREATE_ERROR = 'Something went wrong creating your wallet. Please try again.';

/**
 * Stage 5E.6 — temporary startup gate. `hasWallet()` is a structural
 * existence check only (does secure wallet storage exist?), NOT a proxy
 * for "backup confirmed" — a future 5E.x stage will add persisted
 * `backupConfirmed` state and refine this into three real states:
 *   no wallet  |  wallet exists / backup incomplete  |  wallet ready
 * For now, `walletExists` routes straight to the existing Home/tab
 * screens; it does not claim the backup phrase was ever written down.
 */
type StartupState =
  | { status: 'checking' }
  | { status: 'noWallet' }
  | { status: 'creating' }
  | { status: 'walletExists' }
  | { status: 'error'; message: string };

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [state, setState] = useState<StartupState>({ status: 'checking' });

  const refreshHasWallet = useCallback(() => {
    try {
      setState(hasWallet() ? { status: 'walletExists' } : { status: 'noWallet' });
    } catch {
      // Generic only — never surfaces native error text (Keychain/OSStatus
      // detail, module-load failure message, etc.) to the user.
      setState({ status: 'error', message: GENERIC_CREATE_ERROR });
    }
  }, []);

  useEffect(() => {
    refreshHasWallet();
  }, [refreshHasWallet]);

  const handleCreate = useCallback(async () => {
    // Never allow double-submit: the button is disabled while creating,
    // and this guards the state transition itself against any other
    // trigger path.
    setState((current) => (current.status === 'creating' ? current : { status: 'creating' }));

    try {
      await createWalletAndPresentBackup();
      // 5. Success: secure native storage is the authoritative source of
      // truth for this temporary stage — re-check it rather than trusting
      // a locally-held "created" flag.
      refreshHasWallet();
    } catch {
      // 6. Failure: createAndPersist() may have already succeeded even
      // though backup-screen presentation then failed (a known partial-
      // success edge case) — re-checking hasWallet() closes that trap
      // instead of offering a "Create Wallet" action that would only hit
      // the existing duplicate-storage rejection.
      try {
        if (hasWallet()) {
          // Persistence already succeeded. Temporary: route to the
          // existing Home/tab state for now — proper backup-resume
          // handling (re-showing the backup phrase, tracking
          // backupConfirmed) is a later 5E.x stage, not this one.
          setState({ status: 'walletExists' });
        } else {
          setState({ status: 'error', message: GENERIC_CREATE_ERROR });
        }
      } catch {
        setState({ status: 'error', message: GENERIC_CREATE_ERROR });
      }
    }
  }, [refreshHasWallet]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <MarketDataProvider>
        <AnimatedSplashOverlay />
        {state.status === 'walletExists' ? (
          <AppTabs />
        ) : state.status === 'checking' ? (
          <View style={styles.checkingContainer} />
        ) : (
          <CreateWalletScreen
            isCreating={state.status === 'creating'}
            errorMessage={state.status === 'error' ? state.message : null}
            onCreate={handleCreate}
          />
        )}
      </MarketDataProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  // Brief, splash-covered placeholder while the initial hasWallet() check
  // resolves — avoids flashing the Create Wallet CTA for a user who
  // already has a wallet.
  checkingContainer: {
    flex: 1,
    backgroundColor: palette.background,
  },
});
