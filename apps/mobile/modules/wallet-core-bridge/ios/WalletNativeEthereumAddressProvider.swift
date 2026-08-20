import Foundation

// Stage 5G.2.0 — native-only Ethereum V1 public-address provider.
//
// Mirrors `WalletNativeMnemonicReconstructor`'s exact shape (read the
// persisted entropy via `WalletSecureStorage`, call one Rust FFI function,
// return only the safe result) — a reused pattern, not a new one. The one
// deliberate difference: this reads a PUBLIC value (the Ethereum address),
// not a secret, so no `WalletBiometricAuthorizer` gate is used here —
// Ethereum addresses are not secret material (ADR-003 §8), and ADR-005
// §7's own local-authentication policy table lists "Receive (view
// address/QR)" as covered by ordinary App Lock, with no separate fresh-
// authentication requirement — exactly the posture this file adopts.
//
// NOT exposed to Expo/React Native directly: this type is deliberately
// `internal` (Swift's default access level — no `public` anywhere in this
// file), lives outside the three files the Stage 5D.8B bridge guard scans
// (WalletCoreBridgeModule.swift, WalletCoreBridge.types.ts,
// WalletCoreBridgeModule.ts), and is never referenced from any of them
// beyond `WalletCoreBridgeModule`'s own `getEthereumAddressV1` Function,
// which is the sole caller.

enum WalletNativeEthereumAddressProvider {
    /// Production entry point: reads the persisted canonical entropy via
    /// `WalletSecureStorage.read()`, then derives the public V1 Ethereum
    /// address via the real native-only FFI call — never generates new
    /// entropy, never caches or stores the result, never touches the
    /// mnemonic sentence, seed, or any private key at any point visible to
    /// this function (all of those exist only transiently inside the Rust
    /// call itself, and never cross back out of it). The `entropy` read
    /// here never leaves this function except as the one argument to
    /// `deriveEthereumV1AddressV1`; this function's own return value is
    /// only ever the public address string that call produces.
    static func address() throws -> String {
        let entropy = try WalletSecureStorage.read()
        return try deriveEthereumV1AddressV1(entropy: entropy)
    }
}
