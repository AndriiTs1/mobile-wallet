import Foundation

struct WalletBitcoinV1Input {
  let txid: String
  let vout: UInt32
  let valueSat: UInt64
}

struct WalletBitcoinV1TransactionIntent {
  let inputs: [WalletBitcoinV1Input]
  let destinationAddress: String
  let amountSat: UInt64
  let changeAddress: String?
  let changeSat: UInt64
}

struct WalletSignedBitcoinV1Transaction {
  let signedTxHex: String
  let txid: String
}

enum WalletBitcoinSigningError: Error {
  case failed
}

/// Native-only Bitcoin V1 transaction signing orchestrator.
///
/// SECURITY ORDER — fixed and intentional:
///
/// 1. fresh device-owner authentication
/// 2. only after auth succeeds, read persisted canonical entropy
/// 3. pass entropy + PUBLIC structured transaction intent to wallet-core
/// 4. Rust derives the fixed BIP-84 receive key and signs internally
/// 5. return only signed transaction hex + txid
///
/// No entropy, mnemonic, seed, xpriv, private key, derivation path,
/// precomputed sighash, scriptCode, or witness ever crosses to React Native.
///
/// This operation performs NO network request and NO broadcast.
enum WalletNativeBitcoinTransactionSigner {
  static func sign(
    intent: WalletBitcoinV1TransactionIntent
  ) async throws -> WalletSignedBitcoinV1Transaction {
    do {
      // Signing authorization is intentionally fresh for EVERY transaction.
      //
      // A previous app unlock, recovery-phrase reveal, Ethereum signing
      // authorization, or Bitcoin signing authorization never satisfies this.
      try await WalletBiometricAuthorizer.authorize(
        reason: "Authorize Bitcoin transaction"
      )

      // Read secret material only AFTER successful authentication.
      var entropy = try WalletSecureStorage.read()

      defer {
        // Best-effort clearing of the Swift-owned Data buffer.
        //
        // This does not claim to erase every allocator/compiler copy.
        entropy.resetBytes(in: 0..<entropy.count)
      }

      let ffiIntent = FfiBitcoinV1TransactionIntent(
        inputs: intent.inputs.map { input in
          FfiBitcoinV1Input(
            txid: input.txid,
            vout: input.vout,
            valueSat: input.valueSat
          )
        },
        destinationAddress: intent.destinationAddress,
        amountSat: intent.amountSat,
        changeAddress: intent.changeAddress,
        changeSat: intent.changeSat
      )

      let signed = try dangerousNativeOnlySignBitcoinTransactionV1(
        entropy: entropy,
        intent: ffiIntent
      )

      return WalletSignedBitcoinV1Transaction(
        signedTxHex: signed.signedTxHex,
        txid: signed.txid
      )
    } catch {
      // Deliberately collapse biometric / storage / Rust crypto detail into
      // one small native error surface. No OSStatus, Keychain detail, Rust
      // enum detail, or secret-adjacent information crosses toward Expo.
      throw WalletBitcoinSigningError.failed
    }
  }
}
