import ExpoModulesCore

// Stage 5G.1 — RN-facing structured V1 Ethereum EIP-1559 transaction
// intent. Every field is public transaction data; the three
// wei-denominated quantities are strings specifically to avoid JS
// floating-point precision loss crossing this boundary (chainId/nonce/
// gasLimit are safe as plain numbers — their realistic range never
// approaches JS's safe-integer limit). No field here can ever hold a
// private key, seed, entropy, mnemonic, xpriv, or precomputed signing
// hash — see WalletNativeEthereumTransactionSigner.swift's own doc
// comment for the full trust-boundary design this shape serves.
struct EthereumV1TransactionIntentInput: Record {
  @Field var chainId: UInt64 = 0
  @Field var nonce: UInt64 = 0
  @Field var toHex: String = ""
  @Field var valueWeiDecimal: String = ""
  @Field var gasLimit: UInt64 = 0
  @Field var maxFeePerGasWeiDecimal: String = ""
  @Field var maxPriorityFeePerGasWeiDecimal: String = ""
  @Field var dataHex: String = ""
}

// Stage 5G.1 — the only thing signEthereumTransactionV1 ever resolves
// with. Both fields are non-secret and hex-encoded.
struct EthereumV1SignedTransactionOutput: Record {
  @Field var signedTxHex: String = ""
  @Field var txHashHex: String = ""
}

public class WalletCoreBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WalletCoreBridge")

    Function("getVersion") {
      version()
    }

    Function("healthCheck") {
      healthCheck()
    }

    // Stage 5E.4: secret-free. Takes no argument, resolves with no value —
    // the native backup-phrase screen (WalletBackupPhraseView, Stage
    // 5E.3) is solely responsible for obtaining and rendering the phrase;
    // this function only asks WalletBackupPhrasePresenter to show it.
    AsyncFunction("presentBackupPhrase") {
      try await WalletBackupPhrasePresenter.present()
    }

    // Stage 5E.5: secret-free. Takes no argument, resolves with no value.
    // Composes the existing create/persist orchestrator (Stage 5D.8C/
    // 5D.8D) and the backup-phrase presenter (Stage 5E.4) natively; on any
    // failure only a generic error crosses to React Native (see
    // WalletCreateAndBackupPresenter's own doc comment).
    AsyncFunction("createWalletAndPresentBackup") {
      try await WalletCreateAndBackupPresenter.createAndPresentBackup()
    }

    // Stage 5E.6: secret-free. Returns only a boolean — whether wallet
    // secret storage currently exists — never any byte content, address,
    // or Keychain/OSStatus detail. Calls WalletSecureStorage.exists()
    // directly: it is one of this bridge's ordinary safe wrapper calls,
    // not a native-only secret accessor — it only checks the encrypted
    // envelope's mere presence, never any wallet secret.
    Function("hasWallet") {
      try WalletSecureStorage.exists()
    }

    // Stage 5G.2.0: secret-free. Returns ONLY the persisted wallet's
    // public V1 Ethereum address (a plain string) — never entropy,
    // mnemonic, seed, private key, xpriv, or any other secret material;
    // WalletNativeEthereumAddressProvider.address()'s own doc comment
    // explains why none of those can cross this call. Takes no argument.
    // Ethereum addresses are public data (ADR-003 §8), so — deliberately,
    // consistent with ADR-005 §7's "Receive (view address/QR)" row —
    // this is NOT gated by WalletBiometricAuthorizer; it requires no
    // fresh Face ID/Touch ID/passcode, the same posture as hasWallet()
    // and hasBackupConfirmed() above. Narrowly scoped to exactly this one
    // V1 Ethereum address: no generic deriveAddress(path), no arbitrary
    // derivation-path parameter, no other chain, no key-material
    // primitive of any kind is exposed here or anywhere else in this file.
    Function("getEthereumAddressV1") {
      try WalletNativeEthereumAddressProvider.address()
    }

    // Public-data-only Bitcoin V1 RECEIVE address.
    //
    // Fixed BIP-84 mainnet receive path lives entirely in wallet-core.
    // Takes no argument, exposes no arbitrary path/kind selector, no
    // change address, and no secret material. Reading a public receive
    // address deliberately requires no fresh biometric authorization.
    Function("getBitcoinAddressV1") {
      try WalletNativeBitcoinAddressProvider.receiveAddress()
    }

    // Stage 5E.9B: secret-free. Returns only whether the backup
    // verification flow has ever completed — a read of non-secret
    // UserDefaults-backed metadata, structurally separate from
    // WalletSecureStorage's encrypted envelope (see
    // WalletBackupConfirmationStore's own doc comment). Requires no
    // Secure Enclave/biometric gate to read. No corresponding
    // write/mutation function is exposed to Expo in this stage — only
    // native code may ever set this flag true, and nothing in this stage
    // calls that native setter from any production path yet.
    Function("hasBackupConfirmed") {
      WalletBackupConfirmationStore.isConfirmed()
    }

    // Stage 5F.3: secret-free. Gated reveal entry point for Settings >
    // Recovery & Backup — authenticates via native device-owner
    // authentication (WalletBiometricAuthorizer, Face ID/Touch ID/passcode
    // fallback) BEFORE any phrase reconstruction or presentation occurs.
    // Takes no argument, resolves with no value; rejects with a generic,
    // non-descriptive error on authentication failure/cancellation or any
    // other failure — WalletBiometricAuthorizationError and
    // WalletBackupPhrasePresentationError are both already small, closed,
    // OS-detail-free error surfaces, so nothing further is wrapped here.
    // presentBackupPhrase (above) remains completely unchanged and
    // ungated — ProductionStartupGate's onboarding backupRequired resume
    // flow still depends on calling that one directly.
    AsyncFunction("requestRevealBackup") {
      try await WalletBackupPhrasePresenter.presentGatedReveal()
    }

    // Stage 5F.4A: secret-free. App Lock authorization bridge foundation —
    // NOT wired into any UI/lifecycle yet (no presenter, no App Lock
    // screen exists in this stage). Reuses WalletBiometricAuthorizer
    // exactly as-is: fresh .deviceOwnerAuthentication evaluation, no
    // caching, no persistence. Takes no argument, resolves with no value;
    // rejects with a generic, non-descriptive error on authentication
    // failure/cancellation/unavailability — WalletBiometricAuthorizationError
    // is already a small, closed, OS-detail-free error surface, so nothing
    // further is wrapped here.
    //
    // SECURITY: this authorization is ONLY for application UI access
    // (i.e., whether the app's screens should be visible at all). It MUST
    // NOT be treated as, cached as, or substituted for authorization of
    // recovery-phrase reveal or future transaction signing — those remain
    // entirely independent, each performing its own fresh native
    // authentication (requestRevealBackup above already does; future
    // signing must too). Nothing in this function's return value (a bare
    // Void) or in WalletBiometricAuthorizer itself provides any mechanism
    // to reuse this specific authorization for a different operation.
    AsyncFunction("requestAppUnlock") {
      try await WalletBiometricAuthorizer.authorize(reason: "Unlock Mobile Wallet")
    }

    // Stage 5G.1: the ONE production Ethereum V1 transaction-signing bridge
    // operation. RN passes only a structured, public transaction intent
    // (EthereumV1TransactionIntentInput, above) — never a private key,
    // seed, entropy, mnemonic, xpriv, or precomputed signing hash; there is
    // no field in that shape that could carry one. Composes
    // WalletNativeEthereumTransactionSigner.sign(intent:) exactly: fresh
    // WalletBiometricAuthorizer authorization FIRST, only then
    // WalletSecureStorage.read(), only then the one Rust signing call —
    // see that file's own doc comment for the full, fixed ordering and for
    // why there is no separate "authorize signing" call and no reusable
    // authorization/session state anywhere in this pipeline. Resolves with
    // only the signed transaction hex and its hash (EthereumV1SignedTransactionOutput,
    // above); rejects with a generic, non-descriptive error on any failure
    // — WalletEthereumSigningError is already a small, closed,
    // OS/crypto-detail-free error surface, so nothing further is wrapped
    // here.
    //
    // SECURITY: this authorization is completely independent from
    // requestAppUnlock and requestRevealBackup — being currently unlocked,
    // or having recently revealed the recovery phrase, never satisfies or
    // substitutes for this call's own fresh authentication (ADR-005 §10;
    // this stage's own pre-implementation audit §D).
    AsyncFunction("signEthereumTransactionV1") { (intent: EthereumV1TransactionIntentInput) -> EthereumV1SignedTransactionOutput in
      let signed = try await WalletNativeEthereumTransactionSigner.sign(
        intent: WalletEthereumV1TransactionIntent(
          chainId: intent.chainId,
          nonce: intent.nonce,
          toHex: intent.toHex,
          valueWeiDecimal: intent.valueWeiDecimal,
          gasLimit: intent.gasLimit,
          maxFeePerGasWeiDecimal: intent.maxFeePerGasWeiDecimal,
          maxPriorityFeePerGasWeiDecimal: intent.maxPriorityFeePerGasWeiDecimal,
          dataHex: intent.dataHex
        )
      )
      let output = EthereumV1SignedTransactionOutput()
      output.signedTxHex = signed.signedTxHex
      output.txHashHex = signed.txHashHex
      return output
    }

    #if DEBUG
    // Stage 5E.9E2: DEV-ONLY. Compiled out entirely in Release builds —
    // this Function simply does not exist as an Expo-callable method
    // outside DEBUG, on top of RN only ever calling it from `__DEV__`-
    // gated Showcase Mode (apps/mobile/src/app/_layout.tsx). Secret-free,
    // same as presentBackupPhrase: takes no argument, resolves with no
    // value. Presents the exact same real native UI against the exact
    // same already-persisted wallet entropy as presentBackupPhrase — the
    // ONLY difference (decided entirely in native code, per
    // WalletBackupPhrasePresenter.presentPreview()'s own doc comment) is
    // that a successful preview verification does NOT call
    // WalletBackupConfirmationStore.markConfirmed().
    AsyncFunction("presentBackupPhrasePreview") {
      try await WalletBackupPhrasePresenter.presentPreview()
    }
    #endif
  }
}
