import Foundation

// Stage 5E.5 — secret-free combined create+persist+present orchestration.
//
// No RN "Create Wallet" screen exists yet (confirmed before this stage: no
// onboarding flow, no Create Wallet button anywhere in apps/mobile/src —
// the only RN code touching this module is a dev-only, explicitly
// "NOT a wallet" diagnostic proof component). This file is the native-only
// plumbing this stage's own contingency instructions call for in that
// situation. It does not invent RN UI or a post-dismissal navigation state
// machine — explicitly out of scope per this stage's own "STOP and report
// rather than inventing a broad onboarding state machine" instruction,
// since no onboarding screen exists yet to define that state against.
//
// Composes two already-proven, unmodified pieces, in this fixed order:
//   1. WalletNativeCreateOrchestrator.createAndPersist() (Stage 5D.8C/
//      5D.8D, hardware-validated) — creates and persists a new wallet, or
//      throws (including the existing fail-closed duplicate-store
//      rejection) without ever touching already-persisted entropy.
//   2. WalletBackupPhrasePresenter.present() (Stage 5E.4) — presents the
//      native backup-phrase screen, reached ONLY if step 1 succeeded (a
//      plain sequential `try`/`try`: if the first throws, the second line
//      never executes — the same commit-point-by-control-flow reasoning
//      already used since Stage 5D.8C).
//
// Never calls a dangerous_native_only_* FFI symbol directly — both
// composed steps are themselves the existing safe wrapper layers. Never
// returns, logs, or persists any secret. On any failure from either step,
// throws one fixed, generic, non-descriptive error — the original error's
// structural details (including which of the two steps failed) are
// discarded here, so nothing internal can leak to Expo/React Native.

/// Structural, non-secret, single-case failure. Deliberately discards
/// which step failed and why — "generic user-safe error" per this stage's
/// own requirement.
enum WalletCreateAndBackupError: Error {
    case failed
}

enum WalletCreateAndBackupPresenter {
    /// `@MainActor`: `WalletBackupPhrasePresenter.present()` already
    /// requires the main actor; requiring it here too keeps the whole
    /// sequence on one actor with no internal hop, matching Stage 5E.4's
    /// own reasoning for preferring `@MainActor` + `await` over manual
    /// `DispatchQueue` dispatch.
    ///
    /// `async` as of Stage 5E.8: `WalletBackupPhrasePresenter.present()`
    /// now suspends until the user taps Continue on the backup screen
    /// (see its own doc comment), so this function — and therefore the
    /// `createWalletAndPresentBackup` Expo call wrapping it — resolves
    /// only once that happens, not merely once the screen appears.
    @MainActor
    static func createAndPresentBackup() async throws {
        do {
            _ = try WalletNativeCreateOrchestrator.createAndPersist()
            try await WalletBackupPhrasePresenter.present()
        } catch {
            throw WalletCreateAndBackupError.failed
        }
    }
}
