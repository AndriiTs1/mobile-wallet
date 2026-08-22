import Foundation

// Native-only Bitcoin V1 public RECEIVE-address provider.
//
// Security posture mirrors WalletNativeEthereumAddressProvider:
// - reads persisted canonical entropy only inside native code
// - passes entropy directly to the narrow Rust FFI helper
// - returns only the public Bitcoin mainnet receive address
// - never exposes mnemonic, seed, private key, xpriv, or a derivation path
// - never exposes the Bitcoin change address
// - no fresh biometric authentication is required for reading public data
enum WalletNativeBitcoinAddressProvider {
    static func receiveAddress() throws -> String {
        let entropy = try WalletSecureStorage.read()
        return try deriveBitcoinReceiveV1AddressV1(
            entropy: entropy
        )
    }
}
