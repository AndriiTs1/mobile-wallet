import Foundation

// Stage 5E.9B — native-only, non-secret backup-confirmation metadata
// foundation.
//
// `backupConfirmed` means only: "the wallet backup verification flow has
// successfully completed." It is NOT a secret — ADR-004 §11: "a local
// 'backup verified' flag ... is not itself a security secret, carries no
// ability to reconstruct or access the wallet, and must never be treated
// as, or substitute for, the phrase itself"; ADR-005 §3: "non-sensitive
// application state (e.g., ADR-004 §11's 'backup verified' flag) is stored
// structurally separately from this envelope." Backed by `UserDefaults`,
// deliberately NOT `WalletSecureStorage`/Keychain: this flag requires no
// Secure Enclave gating and no biometric/passcode authentication to read,
// and must never be bundled with, or require unlocking, the encrypted
// wallet-secret envelope.
//
// NOT exposed to Expo/React Native as a mutation surface. `markConfirmed()`
// is `internal` (Swift's default access level — no `public` anywhere in
// this file) and has no caller anywhere in this stage; only a future
// native verification screen (Stage 5E.9D) is intended to ever call it.
// Only the read (`isConfirmed()`) is wired to Expo, via
// `WalletCoreBridgeModule.swift`'s `hasBackupConfirmed` Function. This
// file lives outside the three files the Stage 5D.8B bridge guard scans
// (WalletCoreBridgeModule.swift, WalletCoreBridge.types.ts,
// WalletCoreBridgeModule.ts) and is never itself Expo-visible.
enum WalletBackupConfirmationStore {
    private static let key = "com.swisswallet.WalletBackupConfirmationStore.backupConfirmed"

    /// Non-secret: whether backup verification has ever succeeded. A
    /// missing key (never written — the common case for every wallet
    /// until Stage 5E.9D's verification screen exists) defaults to
    /// `false`, matching `UserDefaults.bool(forKey:)`'s own documented
    /// behavior for an absent key — an absent value must never be
    /// silently interpreted as "confirmed."
    ///
    /// `defaults` defaults to `.standard` for production call sites
    /// (zero-argument call); tests inject a dedicated suite instead, per
    /// this stage's own test-isolation requirement — see
    /// `WalletBackupConfirmationStoreTests`.
    static func isConfirmed(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: key)
    }

    /// Writes `true`. `internal`, not Expo-visible — see this file's own
    /// header comment. No production call site exists yet in this stage;
    /// this exists solely as the foundation Stage 5E.9D's native
    /// verification screen will call on successful verification.
    static func markConfirmed(defaults: UserDefaults = .standard) {
        defaults.set(true, forKey: key)
    }

    /// Test-support only: resets to the default (unconfirmed) state.
    /// Never referenced from any Expo-facing file and never called from
    /// application code — exists solely so XCTest can restore a clean
    /// slate between runs. Production code has no need for this: a real
    /// wallet's confirmation state is never intentionally un-confirmed
    /// once set.
    static func reset(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key)
    }
}
