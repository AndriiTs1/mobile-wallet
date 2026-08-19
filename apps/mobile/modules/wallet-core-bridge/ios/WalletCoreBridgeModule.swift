import ExpoModulesCore

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
