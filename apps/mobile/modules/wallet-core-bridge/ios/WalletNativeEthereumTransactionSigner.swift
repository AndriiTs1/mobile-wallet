import Foundation

// Stage 5G.1 — native Ethereum V1 EIP-1559 transaction-signing orchestrator.
//
// Composes, in this exact fixed order, every single call, with no caching
// and no reusable authorization state anywhere in this file:
//
//   1. WalletBiometricAuthorizer.authorize(...) — a FRESH device-owner
//      authentication. Never satisfied by, and never shares any state
//      with, App Unlock (`requestAppUnlock`) or recovery-phrase reveal
//      (`requestRevealBackup`) — each of those, and this, independently
//      perform their own fresh authentication (ADR-005 §10, restated by
//      this stage's own pre-implementation audit §D: "App Unlock
//      authorization != Recovery Phrase Reveal authorization != Transaction
//      Signing authorization").
//   2. ONLY on success: WalletSecureStorage.read() — the persisted
//      canonical entropy. Never read before step 1 succeeds.
//   3. dangerousNativeOnlySignEthereumTransactionV1(entropy:intent:) — the
//      ONE Rust FFI call that reconstructs the mnemonic, derives the seed
//      and the Ethereum V1 signing key, validates the intent, constructs,
//      hashes, and signs the transaction, and zeroizes every secret
//      intermediate — entirely inside Rust. No separate
//      "authorize signing" call and no token/session exists anywhere in
//      this pipeline; authentication and signing are one atomic operation
//      from RN's point of view.
//   4. Returns ONLY the signed transaction hex and its hash. The private
//      key never leaves Rust, and never passes through this file — unlike
//      recovery-phrase reveal, this file never even receives the mnemonic
//      sentence; only entropy goes in, and only the signed result comes
//      out.
//
// Mirrors `WalletNativeMnemonicReconstructor`'s "native-only orchestrator"
// shape (read entropy -> call a `dangerous_native_only_*` FFI function ->
// return only the safe result), with one addition: the fresh authorization
// step before touching `WalletSecureStorage` at all.
//
// NOT exposed to Expo/React Native directly: this type is deliberately
// `internal` (Swift's default access level — no `public` anywhere in this
// file), lives outside the three files the Stage 5D.8B bridge guard scans
// (WalletCoreBridgeModule.swift, WalletCoreBridge.types.ts,
// WalletCoreBridgeModule.ts), and is never referenced from any of them
// beyond `WalletCoreBridgeModule`'s own `signEthereumTransactionV1`
// AsyncFunction, which is the sole caller.

/// Structural, non-secret failure surface — mirrors
/// `WalletBiometricAuthorizationError`/`FfiWalletError`'s own discipline:
/// no case carries an associated value, so there is nothing here a caller
/// could accidentally surface as OS/storage/crypto detail.
enum WalletEthereumSigningError: Error, Equatable {
    /// Device-owner authentication did not succeed — covers cancellation,
    /// failure, and unavailability alike (mirrors
    /// `WalletBiometricAuthorizationError`'s three cases, deliberately
    /// collapsed to one here: RN never needs to distinguish them for this
    /// call, and finer detail would only widen the generic-error surface
    /// this stage requires). `WalletSecureStorage` is never read and the
    /// Rust signing call is never entered when this case is thrown.
    case authenticationFailed
    /// Authentication succeeded, but something after it failed — a
    /// storage read failure, an unexpected entropy state, a malformed
    /// intent, or the Rust signing call itself. Deliberately generic: no
    /// raw storage/crypto/library error detail ever crosses this boundary.
    case signingFailed
}

/// Public, non-secret V1 Ethereum EIP-1559 transaction fields — the exact
/// same shape as the generated `FfiEthereumV1TransactionIntent` UniFFI
/// binding, kept as a distinct Swift type so `WalletCoreBridgeModule.swift`
/// (one of the three dangerous-symbol-guard-scanned files) never needs to
/// import anything from `Generated/` itself.
struct WalletEthereumV1TransactionIntent {
    let chainId: UInt64
    let nonce: UInt64
    let toHex: String
    let valueWeiDecimal: String
    let gasLimit: UInt64
    let maxFeePerGasWeiDecimal: String
    let maxPriorityFeePerGasWeiDecimal: String
    let dataHex: String
}

/// The only thing `sign(intent:)` ever returns on success. Both fields are
/// non-secret and hex-encoded.
struct WalletSignedEthereumV1Transaction {
    let signedTxHex: String
    let txHashHex: String
}

enum WalletNativeEthereumTransactionSigner {
    /// Production entry point. See this file's header comment for the
    /// exact, fixed step ordering this function enforces on every call.
    static func sign(intent: WalletEthereumV1TransactionIntent) async throws -> WalletSignedEthereumV1Transaction {
        do {
            try await WalletBiometricAuthorizer.authorize(reason: "Authenticate to sign this transaction")
        } catch {
            throw WalletEthereumSigningError.authenticationFailed
        }

        do {
            let entropy = try WalletSecureStorage.read()
            let ffiIntent = FfiEthereumV1TransactionIntent(
                chainId: intent.chainId,
                nonce: intent.nonce,
                toHex: intent.toHex,
                valueWeiDecimal: intent.valueWeiDecimal,
                gasLimit: intent.gasLimit,
                maxFeePerGasWeiDecimal: intent.maxFeePerGasWeiDecimal,
                maxPriorityFeePerGasWeiDecimal: intent.maxPriorityFeePerGasWeiDecimal,
                dataHex: intent.dataHex
            )
            let signed = try dangerousNativeOnlySignEthereumTransactionV1(entropy: entropy, intent: ffiIntent)
            return WalletSignedEthereumV1Transaction(signedTxHex: signed.signedTxHex, txHashHex: signed.txHashHex)
        } catch {
            throw WalletEthereumSigningError.signingFailed
        }
    }
}
