import Foundation

// Stage 5D.8C — native-only create orchestrator.
//
// Proves the real end-to-end native-only path:
//   Rust create session -> obtain canonical entropy -> WalletSecureStorage.
//   store(data:) -> return PUBLIC addresses to the native caller.
//
// NOT exposed to Expo/React Native: this type is deliberately `internal`
// (Swift's default access level — no `public` anywhere in this file), lives
// outside the three files the Stage 5D.8B bridge guard scans
// (WalletCoreBridgeModule.swift, WalletCoreBridge.types.ts,
// WalletCoreBridgeModule.ts), and is never referenced from any of them.
// This is not a user-facing wallet API — no UI, no backup-phrase flow, no
// Expo Function(...)/AsyncFunction(...) wraps anything here.
//
// Storage success is the commit point: `WalletSecureStorage.store(data:)`
// succeeding is what makes the persisted entropy authoritative wallet
// state. Nothing in this file ever calls `WalletSecureStorage.delete()` —
// a failed (including duplicate) create attempt must never remove an
// already-existing wallet; Stage 5D.7's fail-closed duplicate semantics are
// relied on unchanged, not reimplemented here.

/// PUBLIC-SAFE. The only data this orchestrator ever returns. Deliberately
/// no `Debug`/`CustomStringConvertible` — nothing here is secret, but there
/// is also no need for either, so neither is added.
struct NativeCreatedWalletPublicResult {
    let ethereum: String
    let bitcoinReceive: String
    let bitcoinChange: String
}

enum WalletNativeCreateOrchestrator {
    /// Production entry point. Performs, in order: (A) calls the real Rust
    /// creation path, (B) reads the public addresses, (C) reads the
    /// canonical entropy exactly once, then delegates to
    /// `commitAndBuildPublicResult` for (D) persistence and (E) building the
    /// return value only after that succeeds.
    ///
    /// Does NOT call `dangerousNativeOnlyMnemonicWords()` — no backup-phrase
    /// flow exists yet. Does NOT return or retain the session beyond this
    /// function's body; it is a local binding that goes out of scope (and
    /// is released) once this function returns, dropping the Rust-side
    /// `CreateWalletOutput` it wraps.
    static func createAndPersist() throws -> NativeCreatedWalletPublicResult {
        let session = try dangerousNativeOnlyCreateWalletV1()
        let addresses = session.addresses()
        let entropy = session.dangerousNativeOnlyEntropyBytes()
        return try commitAndBuildPublicResult(entropy: entropy, addresses: addresses)
    }

    /// Shared commit-point logic: persist `entropy`, and only if that
    /// succeeds, build the public result from `addresses`.
    ///
    /// This is the test seam Stage 5D.8C's own instructions call for: it
    /// lets tests exercise the exact same `WalletSecureStorage.store(...)`
    /// commit-point semantics (duplicate-rejection, fail-closed errors) the
    /// production path uses, using synthetic entropy/addresses instead of
    /// non-deterministic Rust-generated ones — without any dependency-
    /// injection framework, mocking, or fake Rust layer. `createAndPersist()`
    /// above still calls the real `dangerousNativeOnlyCreateWalletV1()`/
    /// `dangerousNativeOnlyEntropyBytes()` unconditionally; this function is
    /// not a substitute for that path, only its shared tail.
    ///
    /// `internal` (default), matching `WalletSecureStorage`'s own
    /// visibility — reachable via `@testable import` from the test target,
    /// never exposed to Expo/RN.
    static func commitAndBuildPublicResult(
        entropy: Data,
        addresses: FfiV1WalletAddresses
    ) throws -> NativeCreatedWalletPublicResult {
        // Secret lifetime: `entropy` is a caller-supplied parameter used
        // exactly once, immediately below, in the narrowest practical local
        // scope — never stored in a property, cached, copied into another
        // array/string, logged, or returned. A `Data.resetBytes(in:)`-style
        // manual scrub was considered and deliberately NOT added: `Data` is
        // copy-on-write, and this function cannot verify whether the
        // instance handed in by UniFFI's FfiConverter uniquely owns its
        // backing buffer. Calling a mutating reset here could silently
        // trigger a COW copy-and-zero-the-copy — an extra, unaccounted-for
        // copy while leaving the original buffer unzeroed — which would be
        // a false sense of security, not a real one. Minimizing lexical
        // lifetime is the honest, verifiable mitigation available here; it
        // does not eliminate every FFI/runtime copy UniFFI or Swift's own
        // memory management may have made before this function was called
        // (Stage 5D.8A report §J; Stage 5D.8B doc comments, unchanged).
        try WalletSecureStorage.store(data: entropy)

        return NativeCreatedWalletPublicResult(
            ethereum: addresses.ethereum,
            bitcoinReceive: addresses.bitcoinReceive,
            bitcoinChange: addresses.bitcoinChange
        )
    }
}
