import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5F.4B: tests for the cold-launch App Lock gate (`AppLockGate` in
/// `_layout.tsx`) and its minimal presentational lock/retry screen
/// (`app-lock-screen.tsx`). Neither file is native/Swift — there is no RN
/// test runner in this repo (see `apps/mobile/CLAUDE.md`), so, consistent
/// with this project's whole existing methodology (`WalletAppUnlockBridgeTests`,
/// `WalletBackupPhraseGatedRevealTests`, `WalletBackupVerificationRecoveryTests`),
/// these are structural source audits of the exact control flow and
/// literal copy, not behavioral instance tests. These test the security/
/// behavioral contract (mount-gating, fail-closed behavior, absence of
/// forbidden references) — not cosmetic implementation shape (exact
/// statement count/formatting).
final class WalletAppLockGateTests: XCTestCase {
    // MARK: - A: hasWallet() == false permits the existing production flow

    func testHasWalletFalsePermitsExistingProductionFlow() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")
        XCTAssertTrue(source.contains("hasWallet() ? { phase: 'locked' } : { phase: 'noLockNeeded' }"))

        let renderStart = try XCTUnwrap(source.range(of: "if (phase.phase === 'noLockNeeded' || phase.phase === 'unlocked') {"))
        let closeRange = try XCTUnwrap(source.range(of: "\n  }", range: renderStart.upperBound..<source.endIndex))
        let branch = source[renderStart.upperBound..<closeRange.lowerBound]
        XCTAssertTrue(branch.contains("return <>{children}</>;"))
    }

    // MARK: - B: hasWallet() == true does not mount children before unlock

    func testHasWalletTrueDoesNotMountChildrenBeforeUnlock() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")
        // The children-returning branch matches only 'noLockNeeded'/
        // 'unlocked' (test A); every other reachable phase — including
        // 'locked', which the ternary above sets when hasWallet() is true
        // — falls through to AppLockScreen instead.
        XCTAssertTrue(source.contains("if (phase.phase === 'noLockNeeded' || phase.phase === 'unlocked') {"))
        XCTAssertTrue(source.contains("return <AppLockScreen"))
    }

    // MARK: - C: hasWallet() read failure fails closed

    func testHasWalletReadFailureFailsClosed() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")
        let tryStart = try XCTUnwrap(source.range(of: "useState<AppLockPhase>(() => {"))
        let catchStart = try XCTUnwrap(source.range(of: "} catch {", range: tryStart.upperBound..<source.endIndex))
        let closeRange = try XCTUnwrap(source.range(of: "\n  });", range: catchStart.upperBound..<source.endIndex))
        let catchBranch = source[catchStart.upperBound..<closeRange.lowerBound]

        XCTAssertTrue(catchBranch.contains("{ phase: 'locked' }"), "a hasWallet() read failure must fail closed into 'locked'")
        XCTAssertFalse(catchBranch.contains("noLockNeeded"), "a hasWallet() read failure must never be treated as 'no wallet'")
    }

    // MARK: - D: requestAppUnlock() success is the ONLY path to unlocked

    func testRequestAppUnlockSuccessIsTheOnlyPathToUnlocked() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")

        let callSite = try XCTUnwrap(source.range(of: "requestAppUnlock()"))
        let thenRange = try XCTUnwrap(source.range(of: ".then(() => {", range: callSite.upperBound..<source.endIndex))
        let thenClose = try XCTUnwrap(source.range(of: "\n      })", range: thenRange.upperBound..<source.endIndex))
        let thenBody = source[thenRange.upperBound..<thenClose.lowerBound]
        XCTAssertTrue(thenBody.contains("{ phase: 'unlocked' }"))

        let catchRange = try XCTUnwrap(source.range(of: ".catch(() => {", range: thenClose.upperBound..<source.endIndex))
        let catchClose = try XCTUnwrap(source.range(of: "\n      });", range: catchRange.upperBound..<source.endIndex))
        let catchBody = source[catchRange.upperBound..<catchClose.lowerBound]
        XCTAssertFalse(catchBody.contains("unlocked"))
        XCTAssertTrue(catchBody.contains("{ phase: 'authError' }"))
    }

    // MARK: - E: rejection never transitions to unlocked

    func testRejectionNeverTransitionsToUnlocked() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")
        // Exactly three occurrences of the 'unlocked' phase literal in the
        // whole file: the AppLockPhase type-union member, the render
        // condition that permits mounting children, and the single
        // success-path assignment inside .then (proven in test D) — no
        // other code path, including .catch, can ever produce it.
        let occurrences = source.components(separatedBy: "'unlocked'").count - 1
        XCTAssertEqual(occurrences, 3, "'unlocked' must appear only in the AppLockPhase type, the children-mounting render condition, and the requestAppUnlock() success branch")
    }

    // MARK: - F: retry results in a fresh requestAppUnlock() evaluation

    func testRetryResultsInFreshRequestAppUnlockEvaluation() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")
        let retryStart = try XCTUnwrap(source.range(of: "const handleRetry = useCallback(() => {"))
        let retryEnd = try XCTUnwrap(source.range(of: "\n  }, []);", range: retryStart.upperBound..<source.endIndex))
        let retryBody = source[retryStart.upperBound..<retryEnd.lowerBound]

        XCTAssertTrue(retryBody.contains("setPhase({ phase: 'locked' })"))
        // handleRetry never calls requestAppUnlock() directly — it
        // re-enters 'locked', which the single-flight effect (proven to
        // contain the ONE requestAppUnlock() call site in this file — see
        // WalletAppUnlockBridgeTests.testRequestAppUnlockIsOnlyUsedByTheApprovedAppLockGatePath)
        // re-triggers, guaranteeing a genuinely fresh call rather than a
        // second, independent call site.
        XCTAssertFalse(retryBody.contains("requestAppUnlock()"))
    }

    // MARK: - G: ProductionStartupGate is structurally behind AppLockGate

    func testProductionStartupGateIsStructurallyBehindAppLockGate() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")
        let openRange = try XCTUnwrap(source.range(of: "<AppLockGate>"))
        let closeRange = try XCTUnwrap(source.range(of: "</AppLockGate>", range: openRange.upperBound..<source.endIndex))
        let wrapped = source[openRange.upperBound..<closeRange.lowerBound]
        XCTAssertTrue(wrapped.contains("<ProductionStartupGate"))
    }

    // MARK: - H: backupRequired therefore remains behind the same gate

    func testBackupRequiredRemainsBehindTheSameExistingWalletGate() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")

        // AppLockGate never special-cases backupRequired — it gates
        // ProductionStartupGate as a whole (test G), so backupRequired
        // (one of ProductionStartupGate's own internal states, unmodified
        // by this stage) sits behind the same existing-wallet gate as
        // walletReady, not a separately carved-out exception.
        let gateStart = try XCTUnwrap(source.range(of: "function AppLockGate("))
        let gateEnd = try XCTUnwrap(source.range(of: "\n}", range: gateStart.upperBound..<source.endIndex))
        let gateBody = source[gateStart.upperBound..<gateEnd.lowerBound]
        XCTAssertFalse(gateBody.contains("backupRequired"), "AppLockGate must not special-case backupRequired")

        // Regression guard: ProductionStartupGate's own backupRequired
        // branch is unchanged by this stage.
        XCTAssertTrue(source.contains("status === 'backupRequired'"))
        XCTAssertTrue(source.contains("presentBackupPhrase()"))
    }

    // MARK: - I: Showcase Mode remains outside AppLockGate

    func testShowcaseModeRemainsOutsideAppLockGate() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")

        let ternaryStart = try XCTUnwrap(source.range(of: "DEVELOPMENT_SHOWCASE_MODE ? ("))
        let trueBranchEnd = try XCTUnwrap(source.range(of: ") : (", range: ternaryStart.upperBound..<source.endIndex))
        let trueBranch = source[ternaryStart.upperBound..<trueBranchEnd.lowerBound]
        XCTAssertTrue(trueBranch.contains("ShowcaseCreateWalletGate"))
        XCTAssertFalse(trueBranch.contains("AppLockGate"), "Showcase Mode branch must not be wrapped in AppLockGate")

        let falseBranchEnd = try XCTUnwrap(source.range(of: ")}", range: trueBranchEnd.upperBound..<source.endIndex))
        let falseBranch = source[trueBranchEnd.upperBound..<falseBranchEnd.lowerBound]
        XCTAssertTrue(falseBranch.contains("AppLockGate"))
        XCTAssertTrue(falseBranch.contains("ProductionStartupGate"))
        XCTAssertFalse(falseBranch.contains("ShowcaseCreateWalletGate"))
    }

    // MARK: - J: no persisted auth state

    func testNoPersistedAuthState() throws {
        let layoutSource = try mobileAppSource(at: "src/app/_layout.tsx")
        let lockScreenSource = try mobileAppSource(at: "src/components/app-lock-screen.tsx")
        for term in ["AsyncStorage", "SecureStore", "UserDefaults", "localStorage"] {
            XCTAssertFalse(layoutSource.contains(term), "_layout.tsx must not contain \(term)")
            XCTAssertFalse(lockScreenSource.contains(term), "app-lock-screen.tsx must not contain \(term)")
        }
    }

    // MARK: - K: no AppState/background-foreground/grace-period/timer logic

    func testNoAppStateBackgroundForegroundGracePeriodOrTimerLogic() throws {
        let layoutSource = try mobileAppSource(at: "src/app/_layout.tsx")
        let lockScreenSource = try mobileAppSource(at: "src/components/app-lock-screen.tsx")
        for term in ["AppState", "addEventListener(", "setTimeout(", "setInterval(", "Date.now(", "foreground"] {
            XCTAssertFalse(layoutSource.contains(term), "_layout.tsx must not contain \(term)")
            XCTAssertFalse(lockScreenSource.contains(term), "app-lock-screen.tsx must not contain \(term)")
        }
    }

    // MARK: - L: requestRevealBackup remains independent

    func testRequestRevealBackupRemainsIndependent() throws {
        let layoutSource = try mobileAppSource(at: "src/app/_layout.tsx")
        XCTAssertFalse(layoutSource.contains("requestRevealBackup"))
        XCTAssertFalse(layoutSource.contains("WalletBackupPhrasePresenter"))

        let lockScreenSource = try mobileAppSource(at: "src/components/app-lock-screen.tsx")
        XCTAssertFalse(lockScreenSource.contains("requestRevealBackup"))

        // Regression guard: Settings' reveal call site is unchanged.
        let securitySource = try mobileAppSource(at: "src/app/settings/security.tsx")
        XCTAssertTrue(securitySource.contains("requestRevealBackup()"))
    }

    // MARK: - M: no wallet data/secrets appear on AppLockScreen

    func testNoWalletDataOrSecretsOnAppLockScreen() throws {
        let source = try mobileAppSource(at: "src/components/app-lock-screen.tsx")
        for term in [
            "mnemonic", "entropy", "seed", "privateKey", "xpriv",
            "balance", "address", "asset", "wallet-core-bridge",
            "LAError", "errorCode", "OSStatus",
        ] {
            XCTAssertNil(
                source.range(of: term, options: .caseInsensitive),
                "app-lock-screen.tsx must not reference \(term)"
            )
        }
    }

    // MARK: - Helpers

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
