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
