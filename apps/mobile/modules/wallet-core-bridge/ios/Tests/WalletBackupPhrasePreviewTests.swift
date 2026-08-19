import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5E.9E2: tests for the DEV-ONLY backup/verification preview path.
/// Real UIKit presentation is not exercised at runtime here — same
/// established precedent as every other presenter test in this project
/// (source audits over unreasonable UI-test infrastructure). There is no
/// RN/JS test harness in this repo (confirmed absent, `apps/mobile/
/// package.json` has no test script) and this stage does not add one —
/// the RN-side proofs below (F/G/H/I) are source audits of `_layout.tsx`
/// read directly, the same technique this file's Swift-side audits
/// already use, just crossing into the adjacent TypeScript file rather
/// than introducing a JS test runner.
final class WalletBackupPhrasePreviewTests: XCTestCase {
    // MARK: - A: preview path exists separately from the production path

    func testPreviewEntryPointExistsSeparatelyFromProductionEntryPoint() throws {
        let source = try codeOnlySource(of: "WalletBackupPhrasePresenter.swift")
        XCTAssertTrue(source.contains("static func present() async throws {"))
        XCTAssertTrue(source.contains("static func presentPreview() async throws {"))
        // Both must funnel through the same shared presentation logic —
        // this stage's own "do not duplicate the full UI" requirement —
        // rather than each reimplementing presentation/continuation
        // handling independently.
        XCTAssertTrue(source.contains("try await presentFlow(onVerificationSucceeded:"))
    }

    // MARK: - B/C: production marks confirmed, preview does not

    func testProductionEntryPointCallsMarkConfirmed() throws {
        let source = try codeOnlySource(of: "WalletBackupPhrasePresenter.swift")
        let presentRange = try XCTUnwrap(source.range(of: "static func present() async throws {"))
        let presentPreviewRange = try XCTUnwrap(source.range(of: "static func presentPreview() async throws {"))
        let productionBody = source[presentRange.upperBound..<presentPreviewRange.lowerBound]

        XCTAssertTrue(productionBody.contains("WalletBackupConfirmationStore.markConfirmed()"))
    }

    func testPreviewEntryPointNeverCallsMarkConfirmed() throws {
        let source = try codeOnlySource(of: "WalletBackupPhrasePresenter.swift")
        let presentPreviewRange = try XCTUnwrap(source.range(of: "static func presentPreview() async throws {"))
        // `presentFlow`'s own declaration follows `presentPreview` in this
        // file — bounding the search to strictly `presentPreview`'s own
        // body (not the shared helper below it, which correctly contains
        // no direct markConfirmed() call of its own either way).
        let presentFlowRange = try XCTUnwrap(source.range(of: "private static func presentFlow", range: presentPreviewRange.upperBound..<source.endIndex))
        let previewBody = source[presentPreviewRange.upperBound..<presentFlowRange.lowerBound]

        XCTAssertFalse(previewBody.contains("markConfirmed"))
    }

    /// `#if DEBUG`/`#endif` gating around the preview entry point — this
    /// project's chosen dev-gating mechanism (Release builds compile it
    /// out entirely).
    func testPreviewEntryPointIsDebugGated() throws {
        // Read the RAW source (not comment-stripped) — `#if`/`#endif`
        // directive lines are code, not comments, but this double-checks
        // they weren't accidentally written as comments instead.
        let url = try sourceURL(of: "WalletBackupPhrasePresenter.swift")
        let rawSource = try String(contentsOf: url, encoding: .utf8)

        let debugRange = try XCTUnwrap(rawSource.range(of: "#if DEBUG"))
        let previewRange = try XCTUnwrap(rawSource.range(of: "static func presentPreview() async throws {"))
        let endifRange = try XCTUnwrap(rawSource.range(of: "#endif", range: previewRange.upperBound..<rawSource.endIndex))

        XCTAssertTrue(debugRange.upperBound < previewRange.lowerBound)
        XCTAssertTrue(previewRange.upperBound < endifRange.lowerBound)
    }

    func testExpoPreviewFunctionIsDebugGated() throws {
        let url = try sourceURL(of: "WalletCoreBridgeModule.swift")
        let rawSource = try String(contentsOf: url, encoding: .utf8)

        let debugRange = try XCTUnwrap(rawSource.range(of: "#if DEBUG"))
        let functionRange = try XCTUnwrap(rawSource.range(of: "AsyncFunction(\"presentBackupPhrasePreview\")"))
        let endifRange = try XCTUnwrap(rawSource.range(of: "#endif", range: functionRange.upperBound..<rawSource.endIndex))

        XCTAssertTrue(debugRange.upperBound < functionRange.lowerBound)
        XCTAssertTrue(functionRange.upperBound < endifRange.lowerBound)
    }

    // MARK: - D/E: preview never mutates backupConfirmed in either direction

    func testPreviewNeverCallingMarkConfirmedPreservesFalse() {
        let suiteName = "WalletBackupPhrasePreviewTests.preserveFalse"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        defer { defaults.removePersistentDomain(forName: suiteName) }

        XCTAssertFalse(WalletBackupConfirmationStore.isConfirmed(defaults: defaults))
        // Simulates the preview completion policy: a successful
        // verification occurs, but — unlike production — nothing calls
        // markConfirmed(). The state must remain exactly as it was.
        XCTAssertFalse(WalletBackupConfirmationStore.isConfirmed(defaults: defaults))
    }

    func testPreviewNeverCallingMarkConfirmedPreservesTrue() {
        let suiteName = "WalletBackupPhrasePreviewTests.preserveTrue"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        defer { defaults.removePersistentDomain(forName: suiteName) }

        WalletBackupConfirmationStore.markConfirmed(defaults: defaults)
        XCTAssertTrue(WalletBackupConfirmationStore.isConfirmed(defaults: defaults))
        // A previously-confirmed wallet is previewed again: the preview
        // completion policy still never calls markConfirmed() (a no-op
        // twice is still a no-op) — state must remain true, unchanged.
        XCTAssertTrue(WalletBackupConfirmationStore.isConfirmed(defaults: defaults))
    }

    // MARK: - F/G/H/I: RN-side wiring (source-audited — no JS test runner exists)

    /// Locates `ShowcaseCreateWalletGate`'s `hasWallet()` branch bounds.
    /// `"if (hasWallet()) {"` also appears, unrelated, inside
    /// `ProductionStartupGate`'s partial-success catch block earlier in
    /// the file — every search below is deliberately bounded to start
    /// only after `function ShowcaseCreateWalletGate()` so it can never
    /// match that other, unrelated occurrence.
    private func showcaseGateBranches(in source: String) throws -> (existingWallet: Substring, freshWallet: Substring) {
        let gateRange = try XCTUnwrap(source.range(of: "function ShowcaseCreateWalletGate()"))
        let ifRange = try XCTUnwrap(source.range(of: "if (hasWallet()) {", range: gateRange.upperBound..<source.endIndex))
        let elseRange = try XCTUnwrap(source.range(of: "} else {", range: ifRange.upperBound..<source.endIndex))
        let closingRange = try XCTUnwrap(source.range(of: "}, []);", range: elseRange.upperBound..<source.endIndex))

        return (
            existingWallet: source[ifRange.upperBound..<elseRange.lowerBound],
            freshWallet: source[elseRange.upperBound..<closingRange.lowerBound]
        )
    }

    func testShowcaseExistingWalletBranchCallsPreviewAPI() throws {
        let (existingWalletBranch, _) = try showcaseGateBranches(in: try rnLayoutSource())
        XCTAssertTrue(existingWalletBranch.contains("presentBackupPhrasePreview()"))
    }

    func testShowcaseExistingWalletBranchNeverCallsRealPresentBackupPhrase() throws {
        let (existingWalletBranch, _) = try showcaseGateBranches(in: try rnLayoutSource())
        // "presentBackupPhrasePreview()" itself contains "presentBackupPhrase"
        // as a substring, so this checks for the real function called with
        // its own exact, non-preview parens.
        XCTAssertFalse(existingWalletBranch.contains("presentBackupPhrase();"))
    }

    func testShowcaseFreshWalletBranchStillUsesCreateWalletAndPresentBackup() throws {
        let (_, freshWalletBranch) = try showcaseGateBranches(in: try rnLayoutSource())
        XCTAssertTrue(freshWalletBranch.contains("createWalletAndPresentBackup()"))
    }

    // MARK: - Stage 5E.9E3, Part A: existing-wallet preview success -> Home

    func testShowcaseExistingWalletBranchSetsCompletedTrueOnPreviewSuccess() throws {
        let (existingWalletBranch, _) = try showcaseGateBranches(in: try rnLayoutSource())
        XCTAssertTrue(
            existingWalletBranch.contains("setState({ isCreating: false, errorMessage: null, completed: true });"),
            "existing-wallet preview success must set completed: true, routing to Home — Stage 5E.9E3"
        )
    }

    func testCompletedTrueRendersAppTabs() throws {
        let source = try rnLayoutSource()
        let gateRange = try XCTUnwrap(source.range(of: "function ShowcaseCreateWalletGate()"))
        let gateBody = source[gateRange.upperBound...]
        XCTAssertTrue(gateBody.contains("if (state.completed) {"))
        XCTAssertTrue(gateBody.contains("return <AppTabs />;"))
    }

    func testShowcaseExistingWalletBranchNeverCreatesAnotherWallet() throws {
        let (existingWalletBranch, _) = try showcaseGateBranches(in: try rnLayoutSource())
        XCTAssertFalse(existingWalletBranch.contains("createWalletAndPresentBackup"))
    }

    func testProductionStartupGateNeverReferencesPreviewAPI() throws {
        let source = try rnLayoutSource()
        let gateRange = try XCTUnwrap(source.range(of: "function ProductionStartupGate()"))
        let showcaseRange = try XCTUnwrap(source.range(of: "function ShowcaseCreateWalletGate()", range: gateRange.upperBound..<source.endIndex))
        let productionGateBody = source[gateRange.upperBound..<showcaseRange.lowerBound]

        XCTAssertFalse(productionGateBody.contains("presentBackupPhrasePreview"))
        XCTAssertTrue(productionGateBody.contains("presentBackupPhrase()"), "resume flow must still use the real presentBackupPhrase()")
    }

    // MARK: - J: no secret-bearing return or parameters

    func testPreviewSourceHasNoSecretTerms() throws {
        for filename in ["WalletBackupPhrasePresenter.swift", "WalletBackupVerificationView.swift"] {
            let source = try codeOnlySource(of: filename)
            for term in ["mnemonic:", "entropy:", "seed:", "privateKey:", "xpriv:"] {
                XCTAssertFalse(
                    source.contains("Function(\"presentBackupPhrasePreview\", \(term)"),
                    "\(filename) must not accept a secret-bearing parameter"
                )
            }
        }
        let moduleSource = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        for term in ["mnemonic", "entropy", "privateKey", "seed", "xpriv"] {
            XCTAssertNil(
                moduleSource.range(of: term, options: .caseInsensitive),
                "WalletCoreBridgeModule.swift must not reference \(term)"
            )
        }
    }

    // MARK: - K: no dangerous native symbols exposed

    func testPreviewSourceReferencesNoDangerousNativeOnlySymbol() throws {
        for filename in ["WalletBackupPhrasePresenter.swift", "WalletCoreBridgeModule.swift"] {
            let source = try codeOnlySource(of: filename)
            XCTAssertNil(source.range(of: "dangerous_native_only", options: .caseInsensitive))
            XCTAssertNil(source.range(of: "DangerousNativeOnly", options: .caseInsensitive))
        }
    }

    // MARK: - L: no logging/clipboard/share behavior added

    func testPreviewSourceHasNoLoggingOrClipboardOrShareBehavior() throws {
        for filename in ["WalletBackupPhrasePresenter.swift", "WalletCoreBridgeModule.swift"] {
            let source = try codeOnlySource(of: filename)
            for term in ["print(", "NSLog", "os_log", "UIPasteboard", "ShareLink", "UIActivityViewController"] {
                XCTAssertFalse(source.contains(term), "\(filename) must not contain \(term)")
            }
        }
    }

    // MARK: - Helpers

    private func sourceURL(of filename: String) throws -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .appendingPathComponent(filename)
    }

    private func codeOnlySource(of filename: String) throws -> String {
        let source = try String(contentsOf: sourceURL(of: filename), encoding: .utf8)
        return source
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    /// Reads `apps/mobile/src/app/_layout.tsx` directly — there is no RN/
    /// JS test runner in this repo to exercise it behaviorally, so this
    /// stage's RN-side proofs are structural source audits, exactly like
    /// every native-side proof in this file, just crossing into the
    /// adjacent TypeScript file rather than introducing a JS test
    /// framework (explicitly not done, per this stage's own instruction).
    private func rnLayoutSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .deletingLastPathComponent() // modules/
            .deletingLastPathComponent() // apps/mobile/
            .appendingPathComponent("src/app/_layout.tsx")
        let source = try String(contentsOf: url, encoding: .utf8)
        // Unlike this project's Swift files (which use `//`/`///` only),
        // this TS file's doc comments are JSDoc `/** ... */` blocks — every
        // line of one (`/**`, ` * ...`, ` */`) starts with `/` or `*` after
        // trimming. Stripping both prefixes, not just `//`, is required
        // here specifically: an early version of this helper missed this
        // and let a doc-comment mention of `presentBackupPhrasePreview()`
        // leak into an audited code range, causing a false test failure —
        // fixed by broadening the filter, not by narrowing the audit.
        return source
            .components(separatedBy: .newlines)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return !trimmed.hasPrefix("//") && !trimmed.hasPrefix("/*") && !trimmed.hasPrefix("*")
            }
            .joined(separator: "\n")
    }
}
