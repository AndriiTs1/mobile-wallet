import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5E.4: secret-free presentation entry point tests. Pure source
/// audits — this stage adds no new secret-touching logic (the presenter
/// only decides *where* to present `WalletBackupPhraseView`, never *how*
/// it reconstructs the phrase), so there is nothing here to exercise with
/// synthetic entropy; `WalletBackupPhraseViewModelTests` (Stage 5E.3)
/// already covers that and is left unchanged.
///
/// All audits read `//`-comment lines out first — this file's own doc
/// comments legitimately name several of the audited terms while
/// explaining they are deliberately absent from the actual code (the same
/// false-positive class of bug fixed in Stage 5D.8C/5E.3's own source-audit
/// tests).
final class WalletBackupPhrasePresenterTests: XCTestCase {
    func testExpoFacingFunctionTakesNoArgument() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        // The AsyncFunction closure for presentBackupPhrase takes no
        // parameters — a structural check for the exact zero-argument
        // closure form actually used.
        XCTAssertTrue(source.contains("AsyncFunction(\"presentBackupPhrase\") {"))
    }

    func testExpoFacingModuleReferencesNoDangerousNativeOnlySymbol() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertNil(source.range(of: "dangerous_native_only", options: .caseInsensitive))
        XCTAssertNil(source.range(of: "DangerousNativeOnly", options: .caseInsensitive))
    }

    func testExpoFacingModuleHasNoSecretTermsForThisFlow() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        for term in ["mnemonic", "entropy", "privateKey", "seed"] {
            XCTAssertNil(
                source.range(of: term, options: .caseInsensitive),
                "WalletCoreBridgeModule.swift must not reference \(term)"
            )
        }
    }

    func testPresenterInstantiatesWalletBackupPhraseViewNatively() throws {
        let source = try codeOnlySource(of: "WalletBackupPhrasePresenter.swift")
        XCTAssertTrue(source.contains("WalletBackupPhraseView("))
    }

    func testPresenterDoesNotPersistBackupConfirmedOnDismissal() throws {
        let source = try codeOnlySource(of: "WalletBackupPhrasePresenter.swift")
        XCTAssertFalse(source.contains("backupConfirmed"))
        XCTAssertFalse(source.contains("UserDefaults"))
    }

    func testPresenterSourceHasNoLoggingOrClipboardOrShareBehavior() throws {
        let source = try codeOnlySource(of: "WalletBackupPhrasePresenter.swift")
        for term in ["print(", "NSLog", "os_log", "UIPasteboard", "ShareLink", "UIActivityViewController"] {
            XCTAssertFalse(source.contains(term), "WalletBackupPhrasePresenter.swift must not contain \(term)")
        }
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
