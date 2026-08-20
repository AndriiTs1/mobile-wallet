import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5F.3: tests for the gated Recovery & Backup reveal entry point.
/// Real UIKit presentation and real biometric hardware are not exercised
/// at runtime here — same established precedent as every other presenter
/// test in this project (source audits over unreasonable UI-test
/// infrastructure; `WalletBiometricAuthorizer.authorize` itself already
/// has full DI-based behavioral coverage in `WalletBiometricAuthorizerTests`,
/// Stage 5F.2). RN-side proofs (items 9–12) are source audits of
/// `security.tsx`/`_layout.tsx` read directly, the same technique already
/// established in `WalletBackupPhrasePreviewTests.swift`.
final class WalletBackupPhraseGatedRevealTests: XCTestCase {
    // MARK: - 1: authenticates before presentation

    func testGatedRevealAuthenticatesBeforePresenting() throws {
        let body = try presentGatedRevealBody()
        let authorizeRange = try XCTUnwrap(body.range(of: "WalletBiometricAuthorizer.authorize(reason:"))
        let presentRange = try XCTUnwrap(body.range(of: "try await present()"))
        XCTAssertTrue(authorizeRange.upperBound < presentRange.lowerBound)
    }

    // MARK: - 2: auth success calls the real presenter

    func testGatedRevealCallsTheRealProductionPresenter() throws {
        let body = try presentGatedRevealBody()
        // Calls `present()` — the exact same production entry point used
        // by the ungated onboarding path — not a duplicate/parallel
        // presentation implementation.
        XCTAssertTrue(body.contains("try await present()"))
    }

    // MARK: - 3/4: auth failure/cancellation never calls the presenter

    /// Both statements are bare, sequential `try await` calls with no
    /// `catch`/`do` between them — Swift's own `throws` propagation
    /// guarantees that if `authorize(reason:)` throws (for ANY reason:
    /// cancellation, failure, or unavailability — `WalletBiometricAuthorizer`
    /// makes no distinction a caller could special-case even if it wanted
    /// to), `present()` is never reached. This structural proof covers
    /// items 3, 4, and 5 (no reconstruction path reachable before auth
    /// success) at once, since `present()` is the sole gateway to
    /// `WalletBackupPhraseView` construction and therefore to
    /// `WalletBackupPhraseViewModel.loadPhrase()`'s mnemonic
    /// reconstruction.
    func testNoErrorHandlingSwallowsAuthenticationFailureBeforePresenting() throws {
        let body = try presentGatedRevealBody()
        XCTAssertFalse(body.contains("catch"), "no catch must exist between authorize() and present() — a thrown error must propagate, never be swallowed")
        XCTAssertFalse(body.contains("do {"))
        // Exactly two `try await` statements, in the exact required order.
        let statements = body
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.hasPrefix("try await") }
        XCTAssertEqual(statements.count, 2)
        XCTAssertTrue(statements[0].hasPrefix("try await WalletBiometricAuthorizer.authorize(reason:"))
        XCTAssertEqual(statements[1], "try await present()")
    }

    // MARK: - 6/7: new Expo function takes no arguments, returns void only

    func testExpoFunctionTakesNoArgumentsAndReturnsVoid() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertTrue(source.contains("AsyncFunction(\"requestRevealBackup\") {"))
        let range = try XCTUnwrap(source.range(of: "AsyncFunction(\"requestRevealBackup\") {"))
        let closingRange = try XCTUnwrap(source.range(of: "\n    }", range: range.upperBound..<source.endIndex))
        let body = source[range.upperBound..<closingRange.lowerBound]
        // The whole closure body is exactly one call whose return value
        // (`Void`, from `presentGatedReveal()`) is never captured, wrapped,
        // or transformed into anything returned to JS.
        XCTAssertEqual(body.trimmingCharacters(in: .whitespacesAndNewlines), "try await WalletBackupPhrasePresenter.presentGatedReveal()")
    }

    // MARK: - 8: no auth-state/token returned to JS

    func testNoAuthStateOrTokenReturnedAnywhereInTheChain() throws {
        for filename in ["WalletBackupPhrasePresenter.swift", "WalletCoreBridgeModule.swift"] {
            let source = try codeOnlySource(of: filename)
            for term in ["authenticated", "LAContext", "biometryType", "-> Bool", "return true", "return LAContext"] {
                XCTAssertFalse(
                    source.contains(term),
                    "\(filename) must not construct/return an auth-state value near the reveal gate (found \(term))"
                )
            }
        }
    }

    // MARK: - 9/10: Settings wiring

    func testSecuritySettingsCallsRequestRevealBackup() throws {
        let source = try mobileAppSource(at: "src/app/(tabs)/settings/security.tsx")
        XCTAssertTrue(source.contains("await requestRevealBackup();"))
    }

    func testSecuritySettingsNoLongerCallsPresentBackupPhrase() throws {
        let source = try mobileAppSource(at: "src/app/(tabs)/settings/security.tsx")
        XCTAssertFalse(source.contains("presentBackupPhrase"))
    }

    // MARK: - 11/12: ProductionStartupGate onboarding preservation

    func testProductionStartupGateStillCallsPresentBackupPhrase() throws {
        let source = try rnLayoutSource()
        let gateRange = try XCTUnwrap(source.range(of: "function ProductionStartupGate()"))
        let showcaseRange = try XCTUnwrap(source.range(of: "function ShowcaseCreateWalletGate()", range: gateRange.upperBound..<source.endIndex))
        let productionGateBody = source[gateRange.upperBound..<showcaseRange.lowerBound]

        XCTAssertTrue(productionGateBody.contains("presentBackupPhrase()"))
    }

    func testProductionStartupGateNeverCallsRequestRevealBackup() throws {
        let source = try rnLayoutSource()
        let gateRange = try XCTUnwrap(source.range(of: "function ProductionStartupGate()"))
        let showcaseRange = try XCTUnwrap(source.range(of: "function ShowcaseCreateWalletGate()", range: gateRange.upperBound..<source.endIndex))
        let productionGateBody = source[gateRange.upperBound..<showcaseRange.lowerBound]

        XCTAssertFalse(productionGateBody.contains("requestRevealBackup"))
    }

    /// `_layout.tsx` was not modified by this stage at all — the two
    /// tests above audit its pre-existing, untouched content.
    func testLayoutFileImportsPresentBackupPhraseNotRequestRevealBackup() throws {
        let source = try rnLayoutSource()
        XCTAssertTrue(source.contains("presentBackupPhrase,"))
        XCTAssertFalse(source.contains("requestRevealBackup"))
    }

    // MARK: - 13: presentBackupPhrase()/present() implementation unchanged

    func testProductionPresentImplementationUnchanged() throws {
        let source = try codeOnlySource(of: "WalletBackupPhrasePresenter.swift")
        let range = try XCTUnwrap(source.range(of: "static func present() async throws {"))
        let closingRange = try XCTUnwrap(source.range(of: "\n    }", range: range.upperBound..<source.endIndex))
        let body = source[range.upperBound..<closingRange.lowerBound]
            .trimmingCharacters(in: .whitespacesAndNewlines)

        XCTAssertEqual(
            body,
            "try await presentFlow(onVerificationSucceeded: {\n            WalletBackupConfirmationStore.markConfirmed()\n        })"
        )
    }

    func testExpoPresentBackupPhraseFunctionUnchanged() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertTrue(source.contains("AsyncFunction(\"presentBackupPhrase\") {"))
        XCTAssertTrue(source.contains("try await WalletBackupPhrasePresenter.present()"))
    }

    // MARK: - 14: no logging/clipboard/share added

    func testNoLoggingClipboardOrShareAddedAnywhereInThisStage() throws {
        for filename in ["WalletBackupPhrasePresenter.swift", "WalletCoreBridgeModule.swift"] {
            let source = try codeOnlySource(of: filename)
            for term in ["print(", "NSLog", "os_log", "UIPasteboard", "ShareLink", "UIActivityViewController"] {
                XCTAssertFalse(source.contains(term), "\(filename) must not contain \(term)")
            }
        }
        for relativePath in ["src/app/(tabs)/settings/security.tsx", "src/services/wallet-core-bridge.ts"] {
            let source = try mobileAppSource(at: relativePath)
            for term in ["console.log", "console.error", "console.warn", "clipboard", "Share.", "ShareSheet"] {
                XCTAssertFalse(source.contains(term), "\(relativePath) must not contain \(term)")
            }
        }
    }

    // MARK: - 15: no secret-bearing terms/API added to RN

    func testNoSecretTermsAddedToRN() throws {
        for relativePath in ["src/app/(tabs)/settings/security.tsx", "src/services/wallet-core-bridge.ts"] {
            let source = try mobileAppSource(at: relativePath)
            for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv", "LAContext", "biometryType"] {
                XCTAssertNil(
                    source.range(of: term, options: .caseInsensitive),
                    "\(relativePath) must not reference \(term)"
                )
            }
        }
        let moduleTsSource = try walletCoreBridgeSource(at: "src/WalletCoreBridgeModule.ts")
        for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv"] {
            XCTAssertNil(
                moduleTsSource.range(of: term, options: .caseInsensitive),
                "WalletCoreBridgeModule.ts must not reference \(term)"
            )
        }
    }

    // MARK: - Helpers

    private func presentGatedRevealBody() throws -> Substring {
        let source = try codeOnlySource(of: "WalletBackupPhrasePresenter.swift")
        let range = try XCTUnwrap(source.range(of: "static func presentGatedReveal() async throws {"))
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

    /// Reads a file at `apps/mobile/<relativePath>` directly (e.g.
    /// `"src/app/(tabs)/settings/security.tsx"` or
    /// `"src/services/wallet-core-bridge.ts"`) — there is no RN/JS test
    /// runner in this repo, so RN-side proofs are structural source
    /// audits, the same technique
    /// `WalletBackupPhrasePreviewTests.rnLayoutSource()` already
    /// established. Strips `//` and JSDoc `/** ... */`-style comment
    /// lines (this codebase's TS files use JSDoc, not just `//`).
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

    /// Reads `apps/mobile/modules/wallet-core-bridge/<relativePath>`.
    private func walletCoreBridgeSource(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .appendingPathComponent(relativePath)
        return try commentStrippedTSSource(at: url)
    }

    private func rnLayoutSource() throws -> String {
        try mobileAppSource(at: "src/app/_layout.tsx")
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
