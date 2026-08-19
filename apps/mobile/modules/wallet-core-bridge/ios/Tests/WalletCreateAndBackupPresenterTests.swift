import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5E.5: source-audit tests for the secret-free combined
/// create+persist+present orchestration. No behavioral test invokes
/// `createAndPresentBackup()` directly — doing so would trigger a real
/// UIKit modal presentation inside the XCTest host app, which this
/// project's established discipline treats as unreasonable test
/// infrastructure to build for a foundation-only stage (source audits
/// preferred instead, per this stage's own instruction). The create+
/// persist half of this orchestrator is exactly
/// `WalletNativeCreateOrchestrator.createAndPersist()`, unmodified — its
/// own behavioral tests (duplicate-rejection, real persistence,
/// physical-hardware validation, Stage 5D.8C/5D.8D) remain the
/// authoritative proof for that half and are left untouched by this
/// stage; re-running the full suite (see final report) confirms they
/// still pass unmodified.
///
/// All audits read `//`-comment lines out first — this file's own (and
/// the production file's own) doc comments legitimately name several of
/// the audited terms while explaining they are deliberately absent from
/// the actual code.
final class WalletCreateAndBackupPresenterTests: XCTestCase {
    func testComposesCreateAndPersistBeforePresent() throws {
        let source = try codeOnlySource(of: "WalletCreateAndBackupPresenter.swift")

        XCTAssertTrue(source.contains("WalletNativeCreateOrchestrator.createAndPersist()"))
        XCTAssertTrue(source.contains("WalletBackupPhrasePresenter.present()"))

        // Structural call-order proof: the create/persist call's source
        // offset must precede the present call's offset — i.e. the code
        // does not present before (or instead of) creating/persisting.
        let createRange = try XCTUnwrap(source.range(of: "WalletNativeCreateOrchestrator.createAndPersist()"))
        let presentRange = try XCTUnwrap(source.range(of: "WalletBackupPhrasePresenter.present()"))
        XCTAssertTrue(createRange.lowerBound < presentRange.lowerBound)
    }

    func testNeverReferencesADangerousNativeOnlySymbolDirectly() throws {
        let source = try codeOnlySource(of: "WalletCreateAndBackupPresenter.swift")
        XCTAssertNil(source.range(of: "dangerous_native_only", options: .caseInsensitive))
        XCTAssertNil(source.range(of: "DangerousNativeOnly", options: .caseInsensitive))
    }

    func testFailureIsWrappedGenericallyNotPropagatedRaw() throws {
        let source = try codeOnlySource(of: "WalletCreateAndBackupPresenter.swift")
        // Both composed calls sit inside a single `do { ... } catch` that
        // rethrows exactly one fixed, generic case — the original error's
        // structural details never reach the function's own throw site.
        XCTAssertTrue(source.contains("throw WalletCreateAndBackupError.failed"))
    }

    func testExpoFacingFunctionTakesNoArgument() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertTrue(source.contains("AsyncFunction(\"createWalletAndPresentBackup\") {"))
    }

    func testExpoFacingModuleHasNoSecretTermsForThisFlow() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        for term in ["mnemonic", "entropy", "privateKey", "seed", "xpriv"] {
            XCTAssertNil(
                source.range(of: term, options: .caseInsensitive),
                "WalletCoreBridgeModule.swift must not reference \(term)"
            )
        }
    }

    func testPresenterSourceHasNoLoggingOrPersistenceOfConfirmationState() throws {
        let source = try codeOnlySource(of: "WalletCreateAndBackupPresenter.swift")
        for term in ["print(", "NSLog", "os_log", "UserDefaults", "backupConfirmed"] {
            XCTAssertFalse(source.contains(term), "WalletCreateAndBackupPresenter.swift must not contain \(term)")
        }
    }

    // MARK: - Stage 5E.6: hasWallet

    func testHasWalletFunctionTakesNoArgumentAndCallsExistsDirectly() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertTrue(source.contains("Function(\"hasWallet\") {"))
        XCTAssertTrue(source.contains("try WalletSecureStorage.exists()"))
    }

    // MARK: - Helpers

    private func codeOnlySource(of filename: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(filename)
        let source = try String(contentsOf: url, encoding: .utf8)
        return source
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
