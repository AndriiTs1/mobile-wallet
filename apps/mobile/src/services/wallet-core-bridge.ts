/**
 * Stage 5E.6 — thin, typed RN-side wrapper around the native
 * `WalletCoreBridge` Expo module's secret-free API.
 *
 * This file, and every screen that uses it, may only ever see:
 *   - a boolean (`hasWallet`)
 *   - a resolved/rejected `void` (`createWalletAndPresentBackup`)
 *
 * No wallet secret or secret-derived value of any kind ever crosses the
 * Expo boundary in the first place (see `WalletCoreBridgeModule.swift`/`.ts`).
 */

type WalletCoreBridgeApi = {
  hasWallet(): boolean;
  createWalletAndPresentBackup(): Promise<void>;
  presentBackupPhrase(): Promise<void>;
  hasBackupConfirmed(): boolean;
  presentBackupPhrasePreview(): Promise<void>;
  requestRevealBackup(): Promise<void>;
  requestAppUnlock(): Promise<void>;
};

/**
 * Deliberately a deferred `require(...)` inside a function, not a static
 * top-level `import` — same rationale as
 * `components/dev/wallet-core-proof.tsx`: `WalletCoreBridgeModule.ts` calls
 * `requireNativeModule(...)` as a module-evaluation side effect, which
 * throws if the native module isn't linked into this runtime (e.g. Expo
 * Go). A static `import` is hoisted and evaluated before this file's own
 * code ever runs, so only a deferred `require`, itself called from inside
 * try/catch, makes "native module unavailable" fail safely instead of
 * crashing the app at startup.
 */
function loadWalletCoreBridge(): WalletCoreBridgeApi | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../modules/wallet-core-bridge/src/WalletCoreBridgeModule');
    return (mod.default ?? mod) as WalletCoreBridgeApi;
  } catch {
    return null;
  }
}

/**
 * Whether wallet secret storage currently exists on-device. Throws if the
 * native module is unavailable in this runtime, or if the native call
 * itself throws (a genuine storage/hardware failure) — callers must not
 * treat a caught error here as "no wallet"; only a returned `false` means
 * that.
 */
export function hasWallet(): boolean {
  const bridge = loadWalletCoreBridge();
  if (!bridge) {
    throw new Error('Native Wallet Core module unavailable in this runtime.');
  }
  return bridge.hasWallet();
}

/**
 * Creates and persists a new wallet natively, then (only on success)
 * presents the native backup-phrase screen. Resolves with no value;
 * rejects with a generic, non-descriptive error on any failure.
 */
export function createWalletAndPresentBackup(): Promise<void> {
  const bridge = loadWalletCoreBridge();
  if (!bridge) {
    return Promise.reject(new Error('Native Wallet Core module unavailable in this runtime.'));
  }
  return bridge.createWalletAndPresentBackup();
}

/**
 * Presents the native backup-phrase screen for the wallet that already
 * exists — never creates, deletes, or otherwise modifies any wallet state.
 * Resolves with no value; rejects with a generic, non-descriptive error on
 * any failure.
 */
export function presentBackupPhrase(): Promise<void> {
  const bridge = loadWalletCoreBridge();
  if (!bridge) {
    return Promise.reject(new Error('Native Wallet Core module unavailable in this runtime.'));
  }
  return bridge.presentBackupPhrase();
}

/**
 * Stage 5E.9B — foundation only, not yet wired into any routing decision.
 * Whether the backup verification flow has ever completed. Non-secret
 * metadata read only: no corresponding write/mutation function exists on
 * this bridge — only native code may ever set the underlying flag true.
 * Throws if the native module is unavailable in this runtime, or if the
 * native call itself throws.
 */
export function hasBackupConfirmed(): boolean {
  const bridge = loadWalletCoreBridge();
  if (!bridge) {
    throw new Error('Native Wallet Core module unavailable in this runtime.');
  }
  return bridge.hasBackupConfirmed();
}

/**
 * Stage 5E.9E2 — DEV-ONLY. Callers must gate every call site behind
 * `__DEV__` (the native side already only exists in DEBUG builds — see
 * `WalletCoreBridgeModule.swift` — this wrapper adds no gating of its own
 * beyond that). Presents the exact same real native backup/verification UI
 * as `presentBackupPhrase`, against the exact same already-persisted
 * wallet entropy, but a successful verification never marks backup
 * confirmed — see `WalletBackupPhrasePresenter.presentPreview()`'s own
 * doc comment. Resolves with no value; rejects with a generic,
 * non-descriptive error on any failure.
 */
export function presentBackupPhrasePreview(): Promise<void> {
  const bridge = loadWalletCoreBridge();
  if (!bridge) {
    return Promise.reject(new Error('Native Wallet Core module unavailable in this runtime.'));
  }
  return bridge.presentBackupPhrasePreview();
}

/**
 * Stage 5F.3 — requests the gated recovery-phrase reveal flow: native
 * device-owner authentication (Face ID/Touch ID/passcode) must succeed
 * before the phrase is ever reconstructed or presented — see
 * `WalletBackupPhrasePresenter.presentGatedReveal()`'s own doc comment.
 * Resolves with no value; rejects with a generic, non-descriptive error
 * on authentication failure/cancellation or any other failure — never any
 * secret, authentication state, or OS error detail. This is the only
 * function Settings > Recovery & Backup should call; it must never call
 * `presentBackupPhrase` directly (that one stays reserved for the
 * ungated onboarding resume flow).
 */
export function requestRevealBackup(): Promise<void> {
  const bridge = loadWalletCoreBridge();
  if (!bridge) {
    return Promise.reject(new Error('Native Wallet Core module unavailable in this runtime.'));
  }
  return bridge.requestRevealBackup();
}

/**
 * Stage 5F.4A — App Lock authorization bridge foundation. Not wired into
 * any UI/lifecycle yet — no caller exists in this stage. Requests native
 * device-owner authentication (Face ID/Touch ID/passcode fallback) for
 * application UI access only. Resolves with no value; rejects with a
 * generic, non-descriptive error on authentication failure/cancellation/
 * unavailability. No wallet secret, boolean, token, or OS error detail
 * ever crosses this boundary. No UI state or authentication state is
 * stored here or anywhere in this file.
 *
 * This authorization is ONLY for application UI access — it must never be
 * treated as, or substituted for, authorization of recovery-phrase reveal
 * (`requestRevealBackup`) or future transaction signing; each of those
 * independently performs its own fresh native authentication regardless
 * of this call's outcome.
 */
export function requestAppUnlock(): Promise<void> {
  const bridge = loadWalletCoreBridge();
  if (!bridge) {
    return Promise.reject(new Error('Native Wallet Core module unavailable in this runtime.'));
  }
  return bridge.requestAppUnlock();
}
