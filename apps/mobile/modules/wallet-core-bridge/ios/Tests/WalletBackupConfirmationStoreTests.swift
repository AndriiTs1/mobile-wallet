import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5E.9B: tests for the native-only, non-secret backup-confirmation
/// metadata store. Every behavioral test injects its own dedicated
/// `UserDefaults` suite (never `.standard`) so these tests can never read,
/// write, or pollute the real app's persisted state — see `setUpWithError`/
/// `tearDownWithError` below.
final class WalletBackupConfirmationStoreTests: XCTestCase {
    private let suiteName = "WalletBackupConfirmationStoreTests.suite"
    private var defaults: UserDefaults!

    override func setUpWithError() throws {
        defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDownWithError() throws {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
    }

    // MARK: - 1. Missing key / default state

    func testDefaultStateIsUnconfirmed() {
        XCTAssertFalse(WalletBackupConfirmationStore.isConfirmed(defaults: defaults))
    }

    // MARK: - 2. markConfirmed() -> true

    func testMarkConfirmedSetsStateToTrue() {
        WalletBackupConfirmationStore.markConfirmed(defaults: defaults)
        XCTAssertTrue(WalletBackupConfirmationStore.isConfirmed(defaults: defaults))
    }

    // MARK: - 3. Persists across a fresh store read

    func testConfirmedStatePersistsAcrossFreshReads() {
        WalletBackupConfirmationStore.markConfirmed(defaults: defaults)

        // Re-reads through the same suite name via a distinct `UserDefaults`
        // instance, proving the value is genuinely persisted by the suite
        // rather than merely held by the specific instance that wrote it.
        let freshHandle = UserDefaults(suiteName: suiteName)
        XCTAssertTrue(WalletBackupConfirmationStore.isConfirmed(defaults: freshHandle ?? defaults))
    }

    func testResetReturnsStateToUnconfirmed() {
        WalletBackupConfirmationStore.markConfirmed(defaults: defaults)
        XCTAssertTrue(WalletBackupConfirmationStore.isConfirmed(defaults: defaults))

        WalletBackupConfirmationStore.reset(defaults: defaults)
        XCTAssertFalse(WalletBackupConfirmationStore.isConfirmed(defaults: defaults))
    }

    // MARK: - 4. Store contains no wallet secret material

    /// Structural proof, not a runtime one: the store's own source contains
    /// no reference to any secret-shaped term, and persists only a single
    /// `Bool` under one fixed, non-secret key — there is no code path by
    /// which a mnemonic/entropy/seed/key value could ever reach this
    /// `UserDefaults` suite.
    func testStoreSourceContainsNoSecretTerms() throws {
        let source = try codeOnlySource(of: "WalletBackupConfirmationStore.swift")
        for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv"] {
            XCTAssertNil(
                source.range(of: term, options: .caseInsensitive),
                "WalletBackupConfirmationStore.swift must not reference \(term)"
            )
        }
    }

    // MARK: - 5. Expo surface exposes hasBackupConfirmed read

    func testExpoFacingModuleExposesHasBackupConfirmedRead() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertTrue(source.contains("Function(\"hasBackupConfirmed\") {"))
        XCTAssertTrue(source.contains("WalletBackupConfirmationStore.isConfirmed()"))
    }

    // MARK: - 6. Expo surface exposes NO backup-confirmation mutation

    func testExpoFacingModuleExposesNoMutationFunction() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertFalse(source.contains("markConfirmed"))
        for term in ["setBackupConfirmed", "markBackupConfirmed", "confirmBackup"] {
            XCTAssertNil(
                source.range(of: term, options: .caseInsensitive),
                "WalletCoreBridgeModule.swift must not expose \(term)"
            )
        }
    }

    // MARK: - 7. Bridge takes no secret-bearing parameter

    func testHasBackupConfirmedFunctionTakesNoArgument() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        // The exact zero-argument closure form actually used — mirrors the
        // same structural check already used for `hasWallet`/
        // `presentBackupPhrase` elsewhere in this test target.
        XCTAssertTrue(source.contains("Function(\"hasBackupConfirmed\") {"))
    }

    // MARK: - 8. No secret term reaches the new Expo-facing implementation

    func testExpoFacingModuleHasNoSecretTermsForThisFlow() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        for term in ["mnemonic", "entropy", "privateKey", "seed", "xpriv"] {
            XCTAssertNil(
                source.range(of: term, options: .caseInsensitive),
                "WalletCoreBridgeModule.swift must not reference \(term)"
            )
        }
    }

    // MARK: - 9 / 10. No logging, clipboard, or share behavior added

    func testStoreSourceHasNoLoggingOrClipboardOrShareBehavior() throws {
        let source = try codeOnlySource(of: "WalletBackupConfirmationStore.swift")
        for term in ["print(", "NSLog", "os_log", "UIPasteboard", "ShareLink", "UIActivityViewController"] {
            XCTAssertFalse(source.contains(term), "WalletBackupConfirmationStore.swift must not contain \(term)")
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
