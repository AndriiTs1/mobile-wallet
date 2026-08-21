import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.4 — permanent structural source-audit tests for the Ethereum V1
/// Receive screen: `src/app/receive.tsx`.
///
/// Same bounded, structural methodology as
/// `WalletEthereumSendUiSourceAuditTests` (Stage 5G.2.3) — proves SHAPE
/// (which functions are called, which patterns are absent) rather than
/// exact formatting. React Native component rendering cannot be executed
/// under XCTest (no RN runtime here), so this suite cannot prove the screen
/// actually renders correctly at runtime — that is exactly what this
/// stage's own "Physical iPhone QA" section covers instead.
final class WalletEthereumReceiveScreenSourceAuditTests: XCTestCase {
    // MARK: - 6: address is read from the one production bridge function

    func testReceiveReadsAddressFromGetEthereumAddressV1() throws {
        let source = try receiveSource()
        XCTAssertTrue(source.contains("getEthereumAddressV1()"))
        XCTAssertTrue(source.contains("from '@/services/wallet-core-bridge'"))
    }

    func testReceiveNeverDerivesOrCallsAnyOtherAddressApi() throws {
        let source = try receiveSource()
        for term in ["deriveAddress", "getBitcoinAddress", "requireNativeModule", "WalletCoreBridgeModule"] {
            XCTAssertFalse(source.contains(term), "Receive must go through the existing wallet-core-bridge service only — found \(term)")
        }
    }

    // MARK: - 7: no biometric/authentication call anywhere in this screen

    func testReceiveNeverCallsAnyAuthenticationOrBiometricFunction() throws {
        let source = try receiveSource()
        for term in [
            "requestAppUnlock", "requestRevealBackup", "presentBackupPhrase",
            "presentBackupPhrasePreview", "createWalletAndPresentBackup",
            "LocalAuthentication", "BiometricAuthorizer", "FaceID", "Face ID", "TouchID", "Touch ID",
        ] {
            XCTAssertFalse(source.contains(term), "Receive must never call/reference \(term) — reading a public address requires no device-owner authentication")
        }
    }

    // MARK: - 8/9: full, untruncated, selectable address text

    func testAddressIsRenderedSelectable() throws {
        let source = try receiveSource()
        XCTAssertTrue(source.contains("selectable"), "the address Text must be selectable so the user can copy it via native OS selection")
    }

    func testAddressIsNotTruncatedOrShortened() throws {
        let source = try receiveSource()
        for term in ["slice(", "substring(", "substr(", "…", "...", "ellipsis"] {
            XCTAssertFalse(source.contains(term), "the full address must be rendered as-is, never shortened/truncated — found \(term)")
        }
        // The rendered value must be the bridge's own return value with no
        // intermediate transformation applied to it.
        XCTAssertTrue(source.contains("{state.address}"), "the address must be interpolated directly, not derived/reformatted")
    }

    // MARK: - 10: no secret-bearing material anywhere in this screen

    func testNoSecretMaterialInReceiveScreen() throws {
        let source = try receiveSource()
        for term in ["entropy", "mnemonic", "seed", "privateKey", "signedTxHex", "xpriv"] {
            XCTAssertFalse(source.lowercased().contains(term.lowercased()), "must never reference \(term)")
        }
    }

    // MARK: - 11: raw/internal errors are never rendered — only a static generic message

    func testRawErrorsAreNeverRenderedOnlyAGenericMessage() throws {
        let source = try receiveSource()
        XCTAssertFalse(source.contains("error.message"), "must never surface a caught error's own message")
        XCTAssertFalse(source.contains("String(error)"))
        XCTAssertTrue(source.contains("GENERIC_ERROR_MESSAGE"), "must fall back to a single static, safe error string")
        for leak in ["provider", "rpc", "http", "stack trace", "native error", "nsexception", "keychain", "osstatus"] {
            XCTAssertFalse(source.lowercased().contains(leak), "must not leak \(leak) details in UI copy")
        }
    }

    func testAddressReadIsWrappedInTryCatchWithNoUnhandledThrow() throws {
        let source = try receiveSource()
        XCTAssertTrue(source.contains("try {"))
        XCTAssertTrue(source.contains("} catch {"))
        XCTAssertTrue(source.contains("status: 'error'"))
    }

    // MARK: - 12: no clipboard/QR dependency introduced anywhere in this stage's scope

    func testNoClipboardOrQrDependencyReferencedInReceiveScreen() throws {
        let source = try receiveSource()
        for term in ["expo-clipboard", "Clipboard", "react-native-qrcode", "QRCode", "react-native-svg"] {
            XCTAssertFalse(source.contains(term), "Stage 5G.4 is text-only — must not reference \(term)")
        }
    }

    func testNoClipboardOrQrDependencyAddedToPackageJson() throws {
        let packageJson = try mobileAppSource(at: "package.json", subdirectory: "")
        for term in ["expo-clipboard", "@react-native-clipboard/clipboard", "react-native-qrcode", "react-native-svg"] {
            XCTAssertFalse(packageJson.contains(term), "no new clipboard/QR dependency may be added in this stage — found \(term)")
        }
    }

    // MARK: - Home/navigation wiring is covered by WalletHomeSendNavigationSourceAuditTests

    // MARK: - Helpers

    private func receiveSource() throws -> String {
        try mobileAppSource(at: "receive.tsx")
    }

    private func mobileAppSource(at relativePath: String, subdirectory: String = "src/app") throws -> String {
        var url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .deletingLastPathComponent() // modules/
            .deletingLastPathComponent() // apps/mobile/
        if !subdirectory.isEmpty {
            url = url.appendingPathComponent(subdirectory)
        }
        url = url.appendingPathComponent(relativePath)
        let source = try String(contentsOf: url, encoding: .utf8)
        // Strip full-line comments only (never touches inline string
        // literals this suite asserts on).
        return source
            .components(separatedBy: .newlines)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return !trimmed.hasPrefix("//") && !trimmed.hasPrefix("/*") && !trimmed.hasPrefix("*")
            }
            .joined(separator: "\n")
    }
}
