import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppLockScreen } from '@/components/app-lock-screen';
import AppTabs from '@/components/app-tabs';
import { CreateWalletScreen } from '@/components/create-wallet-screen';
import { Colors } from '@/constants/theme';
import { MarketDataProvider } from '@/providers/market-data-provider';
import {
  createWalletAndPresentBackup,
  hasBackupConfirmed,
  hasWallet,
  presentBackupPhrase,
  presentBackupPhrasePreview,
  requestAppUnlock,
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
 * unaffected by Showcase Mode — see its own Stage 5E.9E1 doc comment below)
 * remains entirely wallet-state-driven and is the only path taken in a
 * release build, since `__DEV__` is a build-time constant that is always
 * `false` there.
 *
 * Stage 5E.9E2: `ShowcaseCreateWalletGate`'s existing-wallet branch below
 * now calls the DEV-ONLY `presentBackupPhrasePreview()` instead of the
 * real `presentBackupPhrase()` — see that branch's own doc comment. A
 * developer can run the full preview flow to completion against a real
 * wallet without ever mutating that wallet's real `backupConfirmed` state.
 */
const DEVELOPMENT_SHOWCASE_MODE = __DEV__;

/**
 * Stage 5E.9E1 — the final production three-state startup/resume model,
 * replacing Stage 5E.6's temporary two-state placeholder (`noWallet` /
 * `walletExists`, the latter previously routing straight to Home without
 * regard for backup confirmation). Native storage is the sole source of
 * truth for all three states — nothing here is persisted in JS:
 *
 *   A. `hasWallet() == false`
 *      -> `noWallet` (Create Wallet onboarding)
 *   B. `hasWallet() == true && hasBackupConfirmed() == false`
 *      -> `backupRequired` (resume the EXISTING wallet's backup flow via
 *         `presentBackupPhrase()` only — never `createWalletAndPresentBackup()`)
 *   C. `hasWallet() == true && hasBackupConfirmed() == true`
 *      -> `walletReady` (Home / `AppTabs`)
 */
type StartupState =
  | { status: 'checking' }
  | { status: 'noWallet' }
  | { status: 'creating' }
  | { status: 'backupRequired' }
  | { status: 'walletReady' }
  | { status: 'error'; message: string };

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <MarketDataProvider>
        <AnimatedSplashOverlay />
        {DEVELOPMENT_SHOWCASE_MODE ? (
          <ShowcaseCreateWalletGate />
        ) : (
          <AppLockGate>
            <ProductionStartupGate />
          </AppLockGate>
        )}
      </MarketDataProvider>
    </ThemeProvider>
  );
}

/**
 * Stage 5F.4B — cold-launch App Lock gate. Wraps ONLY the production
 * startup path (`ProductionStartupGate`) — Showcase Mode
 * (`ShowcaseCreateWalletGate`) is deliberately excluded (see this file's
 * own render tree above), per this stage's own approved audit: Showcase
 * Mode is `__DEV__`-only (always `false`/unreachable in a release build,
 * so gating it has no production security consequence either way) and its
 * entire purpose is repeatable dev preview without wallet-state-driven
 * friction.
 *
 * `children` (i.e. `ProductionStartupGate`, and therefore `AppTabs` and the
 * existing `backupRequired`/`walletReady` resume logic) is only ever
 * returned from this component's `noLockNeeded`/`unlocked` branches — every
 * other branch renders `AppLockScreen` instead. This is a structural,
 * render-tree gate: `children` is simply absent from the returned element
 * tree (and therefore never mounted, never in the native view hierarchy)
 * until a wallet doesn't exist, or `requestAppUnlock()` has genuinely
 * resolved — never merely hidden behind `AnimatedSplashOverlay` or any
 * opacity/z-order trick.
 *
 * `requestAppUnlock()`'s own contract (Stage 5F.4A) is untouched: resolves
 * `Promise<void>` only on success, rejects on failure/cancellation/
 * unavailability, carries no boolean/token/OS-error detail. This gate's
 * `phase` is ephemeral `useState`, scoped to this component instance —
 * never written to AsyncStorage/SecureStore/UserDefaults/anywhere else, and
 * therefore never survives process death, exactly like every other
 * in-memory-only piece of state already established in this codebase (e.g.
 * `WalletBackupVerificationView`'s `failedAttempts`). `phase === 'unlocked'`
 * is app-UI-access gating ONLY — it is never read by, passed to, or in any
 * way connected to `requestRevealBackup()`/`WalletBackupPhrasePresenter`
 * (recovery-phrase reveal) or any future signing code, both of which
 * remain entirely independent and continue to perform their own fresh
 * native authentication regardless of this gate's state.
 */
type AppLockPhase =
  | { phase: 'noLockNeeded' }
  | { phase: 'locked' }
  | { phase: 'authenticating' }
  | { phase: 'unlocked' }
  | { phase: 'authError' };

/**
 * Stage 5F.4C — UX timing only, not a security boundary: how long the
 * initial cold-launch branding is held before the FIRST
 * `requestAppUnlock()` call is issued, so the shield/branding remains
 * visibly present for a deliberate moment before the native Face ID/Touch
 * ID/passcode prompt appears, rather than flashing past almost
 * instantly. Applies exactly once per `AppLockGate` mount — see
 * `isFirstAttemptRef` below — never to a `Try Again` retry, and has no
 * relationship whatsoever to backgrounding/resume/re-lock timing (all
 * still out of scope, deferred to Stage 5F.5). Protected children remain
 * exactly as unreachable during this hold as during any other
 * non-`unlocked` phase (see the render branch below) — the hold changes
 * only when the native call is issued, never whether/what mounts.
 *
 * During this hold, `AppLockScreen` renders its `'holding'` variant —
 * shield/logo centered on the dark background ONLY, no title, no spinner,
 * no retry affordance — so the physical-device result is a single
 * continuous shield presentation from `AnimatedSplashOverlay` through to
 * the native Face ID prompt, never a blank pause or a premature "Unlock
 * Mobile Wallet" flash.
 */
const INITIAL_UNLOCK_HOLD_MS = 1000;

function AppLockGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AppLockPhase>(() => {
    try {
      // hasWallet() === true, or the read itself throwing, both fail
      // closed into 'locked' — an unknown wallet-existence state must
      // never be interpreted as "no wallet, no lock needed."
      return hasWallet() ? { phase: 'locked' } : { phase: 'noLockNeeded' };
    } catch {
      return { phase: 'locked' };
    }
  });
  // Guards against requestAppUnlock() being issued more than once
  // concurrently for the same continuous stay in 'locked' (e.g. a
  // re-render before the native call's promise has settled) — same
  // single-flight pattern ProductionStartupGate's own backup-resume effect
  // already uses.
  const unlockInFlightRef = useRef(false);
  // Stage 5F.4C: true only for this component instance's very first
  // 'locked' entry (the genuine cold-launch attempt) — consumed exactly
  // once below and never reset back to true, so a retry (handleRetry)
  // always takes the immediate, non-delayed path.
  const isFirstAttemptRef = useRef(true);

  useEffect(() => {
    if (phase.phase !== 'locked') {
      unlockInFlightRef.current = false;
      return;
    }
    if (unlockInFlightRef.current) {
      return;
    }
    unlockInFlightRef.current = true;

    const isInitialAttempt = isFirstAttemptRef.current;
    isFirstAttemptRef.current = false;

    // Exactly one fresh call per 'locked' entry — never a cached/reused
    // Promise. Only the success branch below may ever set 'unlocked'.
    const beginAuthentication = () => {
      setPhase({ phase: 'authenticating' });
      requestAppUnlock()
        .then(() => {
          unlockInFlightRef.current = false;
          setPhase({ phase: 'unlocked' });
        })
        .catch(() => {
          // Rejection (failure/cancellation/unavailability) never becomes
          // 'unlocked' — protected children remain unmounted, and the
          // user is offered an explicit retry via AppLockScreen below.
          unlockInFlightRef.current = false;
          setPhase({ phase: 'authError' });
        });
    };

    if (isInitialAttempt) {
      const timer = setTimeout(beginAuthentication, INITIAL_UNLOCK_HOLD_MS);
      return () => clearTimeout(timer);
    }
    beginAuthentication();
  }, [phase.phase]);

  const handleRetry = useCallback(() => {
    // Re-enters 'locked', which re-triggers the effect above and issues a
    // genuinely fresh requestAppUnlock() call, immediately — never the
    // previous attempt's Promise/result, and never delayed by
    // INITIAL_UNLOCK_HOLD_MS (isFirstAttemptRef is already false by now).
    setPhase({ phase: 'locked' });
  }, []);

  if (phase.phase === 'noLockNeeded' || phase.phase === 'unlocked') {
    return <>{children}</>;
  }
  // 'locked' (holding, or about to issue a call) renders shield-only;
  // 'authenticating' (call in flight) adds the title/spinner; only
  // 'authError' shows the title/message/retry affordance.
  const variant = phase.phase === 'authError' ? 'error' : phase.phase === 'authenticating' ? 'authenticating' : 'holding';
  return <AppLockScreen variant={variant} onRetry={handleRetry} />;
}

/**
 * Production startup routing — the three-state model documented on
 * `StartupState` above. Never reached when Showcase Mode is active.
 */
function ProductionStartupGate() {
  const [state, setState] = useState<StartupState>({ status: 'checking' });
  // Guards against `presentBackupPhrase()` being triggered more than once
  // concurrently for the same continuous stay in `backupRequired` (e.g. a
  // re-render before the native call's promise has settled) — see the
  // resume effect below. Reset whenever `state.status` leaves
  // `backupRequired`, so a later, genuinely new entry into that status
  // (within the same session) is still allowed to attempt resume again;
  // this is a re-render guard, not a permanent one-shot flag.
  const backupResumeInFlightRef = useRef(false);

  /**
   * The one authoritative refresh function for this gate. Always re-reads
   * native truth in the required order — never trusts a locally-held
   * flag after any operation completes, and never reads
   * `hasBackupConfirmed()` when no wallet exists at all (state A doesn't
   * need or want that read).
   */
  const refreshStartupState = useCallback(() => {
    try {
      const walletExists = hasWallet();
      if (!walletExists) {
        setState({ status: 'noWallet' });
        return;
      }
      const confirmed = hasBackupConfirmed();
      setState(confirmed ? { status: 'walletReady' } : { status: 'backupRequired' });
    } catch {
      // Generic only — never surfaces native error text (Keychain/OSStatus
      // detail, module-load failure message, etc.) to the user.
      setState({ status: 'error', message: GENERIC_CREATE_ERROR });
    }
  }, []);

  useEffect(() => {
    refreshStartupState();
  }, [refreshStartupState]);

  /**
   * State B resume: automatically presents the EXISTING wallet's native
   * backup flow exactly once per continuous stay in `backupRequired`.
   * Deliberately calls `presentBackupPhrase()` only — never
   * `createWalletAndPresentBackup()` — since a wallet already exists by
   * definition of being in this state; resuming must only ever
   * reconstruct its existing phrase from its existing persisted entropy,
   * never generate new entropy, overwrite storage, or create a second
   * wallet.
   */
  useEffect(() => {
    if (state.status !== 'backupRequired') {
      backupResumeInFlightRef.current = false;
      return;
    }
    if (backupResumeInFlightRef.current) {
      return;
    }
    backupResumeInFlightRef.current = true;

    presentBackupPhrase()
      .catch(() => {
        // Swallow — an interrupted or failed resume attempt is handled
        // identically to a successful one below: re-read native truth
        // rather than assuming either outcome. `backupConfirmed` only
        // ever becomes true via a genuine successful verification (Stage
        // 5E.9D), so if this rejected or was interrupted, the re-read
        // below will correctly land back on `backupRequired` again.
      })
      .then(() => {
        backupResumeInFlightRef.current = false;
        refreshStartupState();
      });
  }, [state.status, refreshStartupState]);

  const handleCreate = useCallback(async () => {
    // Never allow double-submit: the button is disabled while creating,
    // and this guards the state transition itself against any other
    // trigger path.
    setState((current) => (current.status === 'creating' ? current : { status: 'creating' }));

    try {
      await createWalletAndPresentBackup();
      // Success: re-read native truth rather than trusting a locally-held
      // "created" flag. Expected result after the real create + backup +
      // verification flow: hasWallet() == true && hasBackupConfirmed() ==
      // true -> walletReady -> Home.
      refreshStartupState();
    } catch {
      // createAndPersist() may have already succeeded even though the
      // native flow then failed or was interrupted before backup
      // verification completed (a known partial-success edge case).
      try {
        if (hasWallet()) {
          // Persistence already succeeded — re-read the full authoritative
          // state rather than assuming Home. This correctly lands on
          // `backupRequired` (not `walletReady`) when the wallet exists
          // but verification never completed, which then resumes via the
          // effect above — never a premature jump to Home.
          refreshStartupState();
        } else {
          setState({ status: 'error', message: GENERIC_CREATE_ERROR });
        }
      } catch {
        setState({ status: 'error', message: GENERIC_CREATE_ERROR });
      }
    }
  }, [refreshStartupState]);

  if (state.status === 'walletReady') {
    return <AppTabs />;
  }
  if (state.status === 'checking' || state.status === 'backupRequired') {
    // Same brief, splash-covered placeholder for both: `backupRequired`
    // renders it only for the moment before the native full-screen backup
    // presentation takes over (triggered by the resume effect above) —
    // never Create Wallet (a wallet already exists) and never Home (backup
    // isn't confirmed yet).
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
 * appears.
 *
 * Stage 5E.9E2: the existing-wallet branch below calls the DEV-ONLY
 * `presentBackupPhrasePreview()` instead of the real `presentBackupPhrase()`
 * — the real backup/verification screen's successful-verification path
 * now genuinely writes `backupConfirmed` (Stage 5E.9D), so previewing it
 * against a real wallet must never be able to mutate that wallet's real
 * confirmation state (see `presentBackupPhrasePreview()`'s own doc
 * comment — the DEV-only native completion policy never calls
 * `markConfirmed()`, regardless of what this branch does with the
 * resolved promise).
 *
 * Stage 5E.9E3: physical QA asked for a completed preview to route to
 * Home, same as the fresh-wallet branch, rather than returning to this
 * showcase screen — this branch now sets `completed: true` on successful
 * preview completion. This is purely presentational routing: it has no
 * bearing on `backupConfirmed` itself, which the preview path still never
 * touches either way. On the next full app restart, `hasWallet()` is
 * still `true` and this component remounts fresh, so Showcase Mode
 * starts over from the Create Wallet screen again, as intended for
 * repeated demos.
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
      if (hasWallet()) {
        // DEV-ONLY preview (Stage 5E.9E2) — reveals the existing wallet's
        // own already-persisted phrase and lets the verification screen
        // be exercised visually, but never marks that real wallet's
        // backup confirmed either way (see this function's own doc
        // comment). Stage 5E.9E3: routes to Home on completion, same as
        // the fresh-wallet branch below — purely presentational, doesn't
        // touch backupConfirmed.
        await presentBackupPhrasePreview();
        setState({ isCreating: false, errorMessage: null, completed: true });
      } else {
        // No wallet yet on this dev device — exercise the real, genuine
        // create/persist/backup-present flow, unmodified. This wallet is
        // actually created through the real flow, so a truthfully
        // confirmed backup and a Home transition afterward are correct.
        await createWalletAndPresentBackup();
        setState({ isCreating: false, errorMessage: null, completed: true });
      }
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
