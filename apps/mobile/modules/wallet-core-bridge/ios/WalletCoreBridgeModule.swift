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
  }
}
