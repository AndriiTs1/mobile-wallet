import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.2.0: tests for the `getEthereumAddressV1` bridge surface
/// (`WalletCoreBridgeModule.swift`'s `Function`, and the TS/RN
/// declarations/wrapper). Consistent with this project's whole existing
/// methodology, these are structural source audits, not behavioral
/// (Secure-Enclave-backed derivation is covered separately by
/// `WalletNativeEthereumAddressProviderTests`).
final class WalletEthereumAddressBridgeTests: XCTestCase {
    // MARK: - Bridge Function exists and delegates to the provider

    func testGetEthereumAddressV1ExistsAndDelegatesToTheProvider() throws {
        let body = try getEthereumAddressV1Body()
        XCTAssertTrue(body.contains("WalletNativeEthereumAddressProvider.address()"))
    }

    // MARK: - No biometric gate on this Function

    func testGetEthereumAddressV1BodyDoesNotReferenceBiometricAuthorizer() throws {
        let body = try getEthereumAddressV1Body()
        XCTAssertFalse(body.contains("WalletBiometricAuthorizer"), "reading a public address must not require device-owner authentication")
    }

    // MARK: - No secret terms / no arbitrary derivation-path API anywhere
    // in the bridge-facing surface

    func testBridgeFacingFilesReferenceNoSecretOrArbitraryPathTerms() throws {
        let swiftSource = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv", "derivationPath", "path:"] {
            XCTAssertNil(
                swiftSource.range(of: term, options: .caseInsensitive),
                "WalletCoreBridgeModule.swift must not reference \(term)"
            )
        }

        for path in ["src/WalletCoreBridge.types.ts", "src/WalletCoreBridgeModule.ts"] {
            let source = try walletCoreBridgeSource(at: path)
            for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv", "derivationPath"] {
                XCTAssertNil(
                    source.range(of: term, options: .caseInsensitive),
                    "\(path) must not reference \(term)"
                )
            }
        }

        let rnServiceSource = try mobileAppSource(at: "src/services/wallet-core-bridge.ts")
        for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv", "derivationPath"] {
            XCTAssertNil(
                rnServiceSource.range(of: term, options: .caseInsensitive),
                "wallet-core-bridge.ts must not reference \(term)"
            )
        }
    }

    // MARK: - No generic deriveAddress(path)-shaped API exists anywhere

    func testNoGenericDeriveAddressWithPathParameterExists() throws {
        for (label, source) in [
            ("WalletCoreBridgeModule.swift", try codeOnlySource(of: "WalletCoreBridgeModule.swift")),
            ("WalletNativeEthereumAddressProvider.swift", try codeOnlySource(of: "WalletNativeEthereumAddressProvider.swift")),
        ] {
            XCTAssertFalse(source.contains("deriveAddress("), "\(label) must not expose a generic deriveAddress(...) API")
            XCTAssertFalse(source.contains("(path:"), "\(label) must not accept an arbitrary derivation-path parameter")
        }
    }

    // MARK: - dangerous_native_only symbol never appears in bridge-facing files

    func testDangerousSymbolNeverAppearsInBridgeFacingFiles() throws {
        for filename in ["WalletCoreBridgeModule.swift"] {
            let source = try codeOnlySource(of: filename)
            XCTAssertFalse(
                source.range(of: "dangerous_native_only|DangerousNativeOnly", options: .regularExpression) != nil,
                "\(filename) must never reference a dangerous_native_only_* symbol"
            )
        }
        for path in ["src/WalletCoreBridge.types.ts", "src/WalletCoreBridgeModule.ts"] {
            let source = try walletCoreBridgeSource(at: path)
            XCTAssertFalse(
                source.range(of: "dangerous_native_only|DangerousNativeOnly", options: .regularExpression) != nil,
                "\(path) must never reference a dangerous_native_only_* symbol"
            )
        }
    }

    // MARK: - TypeScript / RN declarations

    func testTypeScriptDeclarationReturnsPlainString() throws {
        let source = try walletCoreBridgeSource(at: "src/WalletCoreBridgeModule.ts")
        XCTAssertTrue(source.contains("getEthereumAddressV1(): string;"))
    }

    func testRNServiceWrapperExistsValidatesAndDelegatesCorrectly() throws {
        let source = try mobileAppSource(at: "src/services/wallet-core-bridge.ts")
        XCTAssertTrue(source.contains("getEthereumAddressV1(): string;"), "WalletCoreBridgeApi must declare getEthereumAddressV1")
        XCTAssertTrue(source.contains("export function getEthereumAddressV1(): EthereumAddress {"))
        XCTAssertTrue(source.contains("return toEthereumAddress(bridge.getEthereumAddressV1());"))
        // Reuses chain-domain's existing validator — no second one.
        XCTAssertTrue(source.contains("import { toEthereumAddress, type EthereumAddress } from 'chain-domain';"))
    }

    // MARK: - Existing wallet creation/import/signing/reveal behavior unchanged

    func testExistingBridgeFunctionsStillDelegateCorrectly() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertTrue(source.contains("AsyncFunction(\"createWalletAndPresentBackup\") {"))
        XCTAssertTrue(source.contains("try await WalletCreateAndBackupPresenter.createAndPresentBackup()"))
        XCTAssertTrue(source.contains("AsyncFunction(\"requestRevealBackup\") {"))
        XCTAssertTrue(source.contains("try await WalletBackupPhrasePresenter.presentGatedReveal()"))
        XCTAssertTrue(source.contains("AsyncFunction(\"requestAppUnlock\") {"))
        XCTAssertTrue(source.contains("try await WalletBiometricAuthorizer.authorize(reason: \"Unlock Mobile Wallet\")"))
        XCTAssertTrue(source.contains("AsyncFunction(\"signEthereumTransactionV1\")"))
        XCTAssertTrue(source.contains("WalletNativeEthereumTransactionSigner.sign("))
        XCTAssertTrue(source.contains("Function(\"hasWallet\") {"))
        XCTAssertTrue(source.contains("try WalletSecureStorage.exists()"))
    }

    // MARK: - Helpers

    private func getEthereumAddressV1Body() throws -> Substring {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        let range = try XCTUnwrap(source.range(of: "Function(\"getEthereumAddressV1\") {"))
        let closingRange = try XCTUnwrap(source.range(of: "\n    }", range: range.upperBound..<source.endIndex))
        return source[range.upperBound..<closingRange.lowerBound]
    }

    private func codeOnlySource(of filename: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .appendingPathComponent(filename)
        let source = try String(contentsOf: url, encoding: .utf8)
        return source
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private func mobileAppSource(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .deletingLastPathComponent() // modules/
            .deletingLastPathComponent() // apps/mobile/
            .appendingPathComponent(relativePath)
        return try commentStrippedTSSource(at: url)
    }

    private func walletCoreBridgeSource(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .appendingPathComponent(relativePath)
        return try commentStrippedTSSource(at: url)
    }

    private func commentStrippedTSSource(at url: URL) throws -> String {
        let source = try String(contentsOf: url, encoding: .utf8)
        return source
            .components(separatedBy: .newlines)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return !trimmed.hasPrefix("//") && !trimmed.hasPrefix("/*") && !trimmed.hasPrefix("*")
            }
            .joined(separator: "\n")
    }
}
