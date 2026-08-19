import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { CreateWalletScreen } from '@/components/create-wallet-screen';
import { Colors } from '@/constants/theme';
import { MarketDataProvider } from '@/providers/market-data-provider';
import {
  createWalletAndPresentBackup,
  hasWallet,
  presentBackupPhrase,
} from '@/services/wallet-core-bridge';

SplashScreen.preventAutoHideAsync();

const palette = Colors.dark;

const GENERIC_CREATE_ERROR = 'Something went wrong creating your wallet. Please try again.';

/**
 * Stage 5E.7D — DEVELOPMENT-ONLY "Showcase Mode". Lets designers/developers
 * repeatedly preview the Create Wallet -> Backup Phrase screen during
 * active development, even on a device that already has a real wallet —
 * the existing wallet is never recreated (see `ShowcaseCreateWalletGate`'s
 * safety check below). Production startup routing (`ProductionStartupGate`,
 * unmodified from Stage 5E.6/5E.6B) remains entirely wallet-state-driven
 * and is the only path taken in a release build, since `__DEV__` is a
 * build-time constant that is always `false` there.
 */
const DEVELOPMENT_SHOWCASE_MODE = __DEV__;

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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <MarketDataProvider>
        <AnimatedSplashOverlay />
        {DEVELOPMENT_SHOWCASE_MODE ? <ShowcaseCreateWalletGate /> : <ProductionStartupGate />}
      </MarketDataProvider>
    </ThemeProvider>
  );
}

/**
 * Unchanged production startup routing (Stage 5E.6/5E.6B): `hasWallet()`
 * decides noWallet vs. walletExists at launch; a real create/persist call
 * is the only path to walletExists; failure re-checks `hasWallet()` to
 * avoid the partial-success trap (persistence may have succeeded even
 * though backup-screen presentation then failed). Never reached when
 * Showcase Mode is active.
 */
function ProductionStartupGate() {
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

  if (state.status === 'walletExists') {
    return <AppTabs />;
  }
  if (state.status === 'checking') {
    return <View style={styles.checkingContainer} />;
  }
  return (
    <CreateWalletScreen
      isCreating={state.status === 'creating'}
      errorMessage={state.status === 'error' ? state.message : null}
      onCreate={handleCreate}
    />
  );
}

type ShowcaseState = {
  isCreating: boolean;
  errorMessage: string | null;
  completed: boolean;
};

/**
 * Stage 5E.7D — DEVELOPMENT-ONLY. Always renders the real
 * `CreateWalletScreen` regardless of `hasWallet()`, so Create Wallet ->
 * Backup Phrase can be inspected during development the same as
 * production. Pressing the button branches on `hasWallet()` to pick a
 * safe native action — see the safety comment inside
 * `handleShowcaseCreate`.
 *
 * Stage 5E.8: `presentBackupPhrase()`/`createWalletAndPresentBackup()` now
 * resolve only once the user taps Continue on the native backup screen
 * (see `WalletBackupPhrasePresenter.present()`), not merely once it
 * appears — so, matching `ProductionStartupGate`'s existing behavior,
 * this gate now transitions to Home (`AppTabs`) on that resolution
 * instead of returning to `CreateWalletScreen` indefinitely.
 */
function ShowcaseCreateWalletGate() {
  const [state, setState] = useState<ShowcaseState>({
    isCreating: false,
    errorMessage: null,
    completed: false,
  });

  const handleShowcaseCreate = useCallback(async () => {
    setState((current) =>
      current.isCreating ? current : { isCreating: true, errorMessage: null, completed: false },
    );

    try {
      // CRITICAL SAFETY CHECK — must run before any create call. If a real
      // wallet already exists, createWalletAndPresentBackup() must never
      // be called against it: this branch exists specifically so Showcase
      // Mode never even attempts that call against an existing wallet.
      // Instead, reveal the existing wallet's own already-persisted
      // phrase via the same secret-free presentation call onboarding uses.
      if (hasWallet()) {
        await presentBackupPhrase();
      } else {
        // No wallet yet on this dev device — exercise the real, genuine
        // create/persist/backup-present flow, unmodified.
        await createWalletAndPresentBackup();
      }
      // Reached only after the user taps Continue (Stage 5E.8) — never
      // creates a second wallet, and never persists any "backup
      // confirmed" state; this is presentational routing only, same as
      // ProductionStartupGate's own `walletExists` -> `<AppTabs />` step.
      setState({ isCreating: false, errorMessage: null, completed: true });
    } catch {
      // Generic only, same treatment as production — never the caught
      // error's internal detail.
      setState({ isCreating: false, errorMessage: GENERIC_CREATE_ERROR, completed: false });
    }
  }, []);

  if (state.completed) {
    return <AppTabs />;
  }

  return (
    <CreateWalletScreen
      isCreating={state.isCreating}
      errorMessage={state.errorMessage}
      onCreate={handleShowcaseCreate}
    />
  );
}

const styles = StyleSheet.create({
  // Brief, splash-covered placeholder while the initial hasWallet() check
  // resolves — avoids flashing the Create Wallet CTA for a user who
  // already has a wallet. Production path only; Showcase Mode has no
  // equivalent "checking" phase since it never consults hasWallet() until
  // the button is pressed.
  checkingContainer: {
    flex: 1,
    backgroundColor: palette.background,
  },
});
