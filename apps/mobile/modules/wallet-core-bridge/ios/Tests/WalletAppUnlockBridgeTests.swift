import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5F.4A: tests for the App Lock authorization bridge foundation.
/// Per this stage's own explicit refinement, these test the security/
/// behavioral contract (delegation, absence of forbidden references,
/// non-wiring into any real flow) — not cosmetic implementation shape
/// (exact statement count/formatting). `WalletBiometricAuthorizer.authorize`
/// itself already has full DI-based success/cancel/fail/unavailable
/// coverage in `WalletBiometricAuthorizerTests` (Stage 5F.2); a thin
/// pass-through bridge function doesn't need to re-derive that, only
/// prove it delegates correctly and stays isolated — the same approach
/// `WalletBackupPhraseGatedRevealTests` already established for
/// `requestRevealBackup` (Stage 5F.3).
final class WalletAppUnlockBridgeTests: XCTestCase {
    // MARK: - Entry point exists and delegates to the authorizer

    func testRequestAppUnlockExistsAndDelegatesToAuthorizer() throws {
        let body = try requestAppUnlockBody()
        XCTAssertTrue(body.contains("WalletBiometricAuthorizer.authorize(reason:"))
    }

    // MARK: - Never references secret-touching or presentation types

    func testRequestAppUnlockBodyReferencesNoForbiddenTypes() throws {
        let body = try requestAppUnlockBody()
        for term in [
            "WalletSecureStorage",
            "WalletBackupPhrasePresenter",
            "WalletNativeMnemonicReconstructor",
            "WalletNativeCreateOrchestrator",
            "mnemonic", "entropy", "seed", "privateKey", "xpriv",
            "UserDefaults", "Keychain", "kSecClass",
        ] {
            XCTAssertFalse(body.contains(term), "requestAppUnlock body must not reference \(term)")
        }
    }

    func testModuleFileHasNoLoggingOrAuthTokenPersistence() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        for term in ["print(", "NSLog", "os_log", "authToken", "authState", "authenticated ="] {
            XCTAssertFalse(source.contains(term), "WalletCoreBridgeModule.swift must not contain \(term)")
        }
    }

    // MARK: - RN/native TS contracts return Promise<void>

    func testTypeScriptDeclarationReturnsPromiseVoid() throws {
        let source = try walletCoreBridgeSource(at: "src/WalletCoreBridgeModule.ts")
        XCTAssertTrue(source.contains("requestAppUnlock(): Promise<void>;"))
    }

    func testRNServiceWrapperExistsAndDelegatesCorrectly() throws {
        let source = try mobileAppSource(at: "src/services/wallet-core-bridge.ts")
        XCTAssertTrue(source.contains("requestAppUnlock(): Promise<void>;"), "WalletCoreBridgeApi must declare requestAppUnlock")
        XCTAssertTrue(source.contains("export function requestAppUnlock(): Promise<void> {"))
        XCTAssertTrue(source.contains("return bridge.requestAppUnlock();"))
    }

    // MARK: - No secret terms anywhere in the RN-facing declarations

    func testNoSecretTermsInTypeScriptFiles() throws {
        let source = try mobileAppSource(at: "src/services/wallet-core-bridge.ts")
        for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv", "LAContext", "biometryType"] {
            XCTAssertNil(
                source.range(of: term, options: .caseInsensitive),
                "wallet-core-bridge.ts must not reference \(term)"
            )
        }

        let moduleTsSource = try walletCoreBridgeSource(at: "src/WalletCoreBridgeModule.ts")
        for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv"] {
            XCTAssertNil(
                moduleTsSource.range(of: term, options: .caseInsensitive),
                "WalletCoreBridgeModule.ts must not reference \(term)"
            )
        }
    }

    // MARK: - Existing requestRevealBackup / presentBackupPhrase behavior unchanged

    func testExistingRevealAndPresentFunctionsStillDelegateCorrectly() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertTrue(source.contains("AsyncFunction(\"requestRevealBackup\") {"))
        XCTAssertTrue(source.contains("try await WalletBackupPhrasePresenter.presentGatedReveal()"))
        XCTAssertTrue(source.contains("AsyncFunction(\"presentBackupPhrase\") {"))
        XCTAssertTrue(source.contains("try await WalletBackupPhrasePresenter.present()"))
    }

    // MARK: - Stage 5F.4B supersedes: now used, but ONLY by the approved gate

    /// Stage 5F.4A asserted `requestAppUnlock` was referenced nowhere in
    /// `_layout.tsx`/AppTabs at all — correct for that foundation-only
    /// stage, before any UI wired it up. Stage 5F.4B intentionally
    /// supersedes that: `AppLockGate` is the one approved production call
    /// site. This re-expresses the still-valid part of the old invariant —
    /// exactly one call site, structurally inside `AppLockGate`, which
    /// never directly references `AppTabs` itself (it only ever reaches it
    /// indirectly through `children`/`ProductionStartupGate` after
    /// unlocking) — and that no broader auth/token/state API was
    /// introduced alongside it.
    func testRequestAppUnlockIsOnlyUsedByTheApprovedAppLockGatePath() throws {
        let layoutSource = try mobileAppSource(at: "src/app/_layout.tsx")

        let occurrences = layoutSource.components(separatedBy: "requestAppUnlock()").count - 1
        XCTAssertEqual(occurrences, 1, "requestAppUnlock() must be called exactly once in _layout.tsx")

        let gateStart = try XCTUnwrap(layoutSource.range(of: "function AppLockGate("))
        let gateEnd = try XCTUnwrap(layoutSource.range(of: "\n}", range: gateStart.upperBound..<layoutSource.endIndex))
        let gateBody = layoutSource[gateStart.upperBound..<gateEnd.lowerBound]

        XCTAssertTrue(gateBody.contains("requestAppUnlock()"), "the sole call site must live inside AppLockGate")
        XCTAssertFalse(gateBody.contains("AppTabs"), "AppLockGate must not directly reference AppTabs")

        for term in ["authToken", "biometricToken", "isAuthenticated", "AsyncStorage", "SecureStore", "UserDefaults"] {
            XCTAssertFalse(layoutSource.contains(term), "_layout.tsx must not expose \(term)")
        }

        for filename in ["app-tabs.tsx", "app-tabs.web.tsx"] {
            let source = try mobileAppSource(at: "src/components/\(filename)")
            XCTAssertFalse(source.contains("requestAppUnlock"), "\(filename) must not reference requestAppUnlock directly")
        }
    }

    // MARK: - WalletBiometricAuthorizer / policy untouched

    func testWalletBiometricAuthorizerPolicyUnchanged() throws {
        // This stage must not modify WalletBiometricAuthorizer.swift at
        // all (confirmed independently via git status) — re-asserted here
        // structurally: it still exclusively uses
        // `.deviceOwnerAuthentication`, never
        // `.deviceOwnerAuthenticationWithBiometrics`.
        let source = try codeOnlySource(of: "WalletBiometricAuthorizer.swift")
        XCTAssertTrue(source.contains(".deviceOwnerAuthentication"))
        XCTAssertFalse(source.contains("deviceOwnerAuthenticationWithBiometrics"))
    }

    // MARK: - Helpers

    private func requestAppUnlockBody() throws -> Substring {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        let range = try XCTUnwrap(source.range(of: "AsyncFunction(\"requestAppUnlock\") {"))
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

    /// Reads `apps/mobile/<relativePath>` directly — no RN/JS test runner
    /// exists in this repo, so RN-side proofs are structural source
    /// audits (the technique this project's test suite already
    /// established, e.g. `WalletBackupPhraseGatedRevealTests`).
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
