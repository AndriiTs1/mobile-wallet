import Foundation

// Stage 5E.2 — native-only mnemonic reconstruction from persisted entropy.
//
// Persisted canonical entropy (WalletSecureStorage) remains the sole source
// of truth for wallet identity. The mnemonic sentence is never itself
// persisted — it is deterministically reconstructed on demand, only inside
// native code, and only for the duration of the caller that needs it
// (ADR-005 §2's "reveal reconstructs the sentence from the stored entropy"
// design).
//
// NOT exposed to Expo/React Native: this type is deliberately `internal`
// (Swift's default access level — no `public` anywhere in this file), lives
// outside the three files the Stage 5D.8B bridge guard scans
// (WalletCoreBridgeModule.swift, WalletCoreBridge.types.ts,
// WalletCoreBridgeModule.ts), and is never referenced from any of them.
// This is not a user-facing wallet API — no UI, no backup-phrase flow, no
// Expo Function(...)/AsyncFunction(...) wraps anything here.

enum WalletNativeMnemonicReconstructor {
    /// Production entry point: reads the persisted canonical entropy via
    /// `WalletSecureStorage.read()`, then reconstructs the BIP-39 mnemonic
    /// sentence via the real native-only FFI call — never generates new
    /// entropy, never caches or stores the result. `entropy`/the returned
    /// mnemonic are local bindings only; this function retains nothing
    /// beyond its own body, and callers are responsible for keeping their
    /// own use of the result to as narrow a lexical scope as possible (no
    /// property storage, no logging, no caching) — the same discipline
    /// `WalletNativeCreateOrchestrator` already applies to entropy.
    ///
    /// Swift secret lifetime: the returned `String` is a fresh copy made by
    /// UniFFI when crossing the FFI boundary — outside Rust's zeroize-on-drop
    /// guarantees. No manual "zero the String" step is added here: Swift's
    /// `String` is copy-on-write and this function cannot verify unique
    /// buffer ownership, so a manual clear could silently zero a throwaway
    /// COW copy while leaving the original untouched — a false sense of
    /// security, not a real one (the same reasoning already documented in
    /// `WalletNativeCreateOrchestrator` for `Data`).
    static func reconstructMnemonic() throws -> String {
        let entropy = try WalletSecureStorage.read()
        return try dangerousNativeOnlyMnemonicFromEntropyV1(entropy: entropy)
    }
}
