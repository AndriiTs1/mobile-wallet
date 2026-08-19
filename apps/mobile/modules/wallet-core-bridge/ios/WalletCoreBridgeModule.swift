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
  }
}
