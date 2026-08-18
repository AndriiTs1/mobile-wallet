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
  }
}
