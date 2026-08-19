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
        let thenClose = try XCTUnwrap(source.range(of: "\n        })", range: thenRange.upperBound..<source.endIndex))
        let thenBody = source[thenRange.upperBound..<thenClose.lowerBound]
        XCTAssertTrue(thenBody.contains("{ phase: 'unlocked' }"))

        let catchRange = try XCTUnwrap(source.range(of: ".catch(() => {", range: thenClose.upperBound..<source.endIndex))
        let catchClose = try XCTUnwrap(source.range(of: "\n        });", range: catchRange.upperBound..<source.endIndex))
        let catchBody = source[catchRange.upperBound..<catchClose.lowerBound]
        XCTAssertFalse(catchBody.contains("unlocked"))
        XCTAssertTrue(catchBody.contains("{ phase: 'authError' }"))
    }

    // MARK: - E: rejection never transitions to unlocked

    func testRejectionNeverTransitionsToUnlocked() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")
        // Five occurrences of the 'unlocked' phase literal in the whole
        // file: the AppLockPhase type-union member, the children-mounting
        // render condition, the single WRITE inside requestAppUnlock()'s
        // success branch (proven exclusive by test D — .catch never
        // produces it), and two Stage 5F.5A READS inside the AppState
        // re-lock listener (deciding whether to arm the background clock,
        // and whether to evaluate it on foreground) — reads only, never a
        // second write path to 'unlocked'.
        let occurrences = source.components(separatedBy: "'unlocked'").count - 1
        XCTAssertEqual(occurrences, 5, "'unlocked' must appear only in the AppLockPhase type, the render condition, the requestAppUnlock() success branch, and the two Stage 5F.5A AppState read-checks")
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

    // MARK: - K (superseded by Stage 5F.5A): AppState usage scoped to the
    // approved re-lock listener only

    /// Stage 5F.4B/5F.4C asserted `AppState`/`addEventListener(` were absent
    /// entirely — correct before any lifecycle re-lock existed. Stage 5F.5A
    /// intentionally supersedes that: `AppState.addEventListener` is now
    /// legitimately used, exactly once, for the background/foreground
    /// re-lock listener. This re-expresses the still-valid part of the old
    /// invariant: that listener may only ever call `setPhase` — never
    /// `requestAppUnlock()` directly (all actual native calls remain
    /// funneled through the pre-existing single-flight effect) — and it
    /// must never inspect `'inactive'`, only `'background'`/`'active'`
    /// (see this stage's own Face-ID-loop analysis). `setInterval`, a
    /// recurring/second timer, and timestamp-comparison logic outside this
    /// one listener still do not exist anywhere.
    func testAppStateUsageIsScopedToTheApprovedReLockListenerOnly() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")

        let occurrences = source.components(separatedBy: "AppState.addEventListener(").count - 1
        XCTAssertEqual(occurrences, 1, "AppState.addEventListener must be called exactly once")

        let listenerStart = try XCTUnwrap(source.range(of: "AppState.addEventListener('change', (nextState) => {"))
        let listenerEnd = try XCTUnwrap(source.range(of: "\n    });", range: listenerStart.upperBound..<source.endIndex))
        let listenerBody = source[listenerStart.upperBound..<listenerEnd.lowerBound]

        XCTAssertFalse(listenerBody.contains("requestAppUnlock("), "the AppState listener must never call requestAppUnlock() directly")
        XCTAssertFalse(listenerBody.contains("'inactive'"), "'inactive' must never be inspected by the re-lock listener")
        XCTAssertTrue(listenerBody.contains("nextState === 'background'"))
        XCTAssertTrue(listenerBody.contains("nextState !== 'active'"))

        let lockScreenSource = try mobileAppSource(at: "src/components/app-lock-screen.tsx")
        XCTAssertFalse(lockScreenSource.contains("AppState"))
        for term in ["addEventListener(", "setInterval(", "foreground"] {
            XCTAssertFalse(lockScreenSource.contains(term), "app-lock-screen.tsx must not contain \(term)")
        }
    }

    // MARK: - R: the grace-period threshold correctly gates re-lock

    func testBackgroundGracePeriodThresholdGatesReLock() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")
        XCTAssertTrue(source.contains("const BACKGROUND_GRACE_PERIOD_MS = 15_000;"))

        let listenerStart = try XCTUnwrap(source.range(of: "AppState.addEventListener('change', (nextState) => {"))
        let listenerEnd = try XCTUnwrap(source.range(of: "\n    });", range: listenerStart.upperBound..<source.endIndex))
        let listenerBody = source[listenerStart.upperBound..<listenerEnd.lowerBound]

        let thresholdStart = try XCTUnwrap(listenerBody.range(of: "if (Date.now() - backgroundedAt >= BACKGROUND_GRACE_PERIOD_MS) {"))
        let thresholdEnd = try XCTUnwrap(listenerBody.range(of: "\n      }", range: thresholdStart.upperBound..<listenerBody.endIndex))
        let thresholdBody = listenerBody[thresholdStart.upperBound..<thresholdEnd.lowerBound]
        XCTAssertTrue(thresholdBody.contains("setPhase({ phase: 'locked' });"))

        // No unconditional/always-lock path exists anywhere in the
        // listener — re-locking happens ONLY behind this one threshold
        // comparison, proving both "short interval does not re-lock" and
        // "interval over threshold does" from the same structural fact.
        XCTAssertEqual(
            listenerBody.components(separatedBy: "setPhase({ phase: 'locked' })").count - 1, 1,
            "setPhase to 'locked' must appear exactly once in the listener, gated by the grace-period comparison"
        )
    }

    // MARK: - S: the re-lock listener lives inside AppLockGate, unreachable
    // from Showcase Mode

    func testAppStateReLockEffectIsScopedInsideAppLockGate() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")
        let gateStart = try XCTUnwrap(source.range(of: "function AppLockGate("))
        let gateEnd = try XCTUnwrap(source.range(of: "\n}", range: gateStart.upperBound..<source.endIndex))
        let gateBody = source[gateStart.upperBound..<gateEnd.lowerBound]
        XCTAssertTrue(
            gateBody.contains("AppState.addEventListener("),
            "the re-lock listener must be declared inside AppLockGate, structurally unreachable from Showcase Mode's separate render branch"
        )
    }

    // MARK: - T: snapshot privacy is explicitly deferred to Stage 5F.5B

    func testSnapshotPrivacyIsExplicitlyDeferredToStage5F5B() throws {
        // Stage 5F.5A is lifecycle re-lock only. App-switcher snapshot
        // privacy (a cosmetic cover, unconditional on the grace-period
        // timer, never a substitute for this structural re-lock gate) is
        // deliberately NOT implemented here — per the Stage 5F.5
        // pre-implementation audit's own recommendation to split into a
        // separately named Stage 5F.5B. This documents that deferral
        // explicitly; update (never silently delete) once 5F.5B lands.
        let componentsDir = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .deletingLastPathComponent() // modules/
            .deletingLastPathComponent() // apps/mobile/
            .appendingPathComponent("src/components")
        let names = (try? FileManager.default.contentsOfDirectory(atPath: componentsDir.path)) ?? []
        XCTAssertFalse(
            names.contains { $0.lowercased().contains("privacy") || $0.lowercased().contains("snapshot") },
            "no snapshot-privacy cover component is expected yet — deferred to Stage 5F.5B"
        )
    }

    // MARK: - N: the initial cold-launch attempt is held for 1000ms

    func testInitialColdLaunchAttemptIsHeldForOneThousandMilliseconds() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")
        XCTAssertTrue(source.contains("const INITIAL_UNLOCK_HOLD_MS = 1000;"))

        // Exactly one setTimeout call site in the whole file — the
        // cold-launch hold — never a recurring/backgrounding-oriented
        // timer, and it is cleaned up on early unmount/dependency change.
        let occurrences = source.components(separatedBy: "setTimeout(").count - 1
        XCTAssertEqual(occurrences, 1, "exactly one setTimeout() call site is expected — the cold-launch hold")
        XCTAssertTrue(source.contains("setTimeout(beginAuthentication, INITIAL_UNLOCK_HOLD_MS)"))
        XCTAssertTrue(source.contains("clearTimeout(timer)"))
    }

    // MARK: - P: initial pre-auth presentation is shield-only

    func testInitialPreAuthPresentationIsShieldOnly() throws {
        let layoutSource = try mobileAppSource(at: "src/app/_layout.tsx")
        // 'locked' (the phase held for INITIAL_UNLOCK_HOLD_MS, and the
        // phase a retry/re-lock also transiently passes through before its
        // immediate re-authentication) must map to the 'holding' variant —
        // never 'authenticating' or 'error' — for both the initial hold and
        // any later re-entry, so the pre-auth screen is always shield-only.
        XCTAssertTrue(layoutSource.contains(
            "const variant = phase.phase === 'authError' ? 'error' : phase.phase === 'authenticating' ? 'authenticating' : 'holding';"
        ))

        // AppLockScreen itself has since been polished to collapse
        // 'holding'/'authenticating' into one identical shield-only
        // presentation, gated on `variant === 'error'` (rather than the
        // earlier `variant !== 'holding'`) — the spinner and its
        // `ActivityIndicator` import were removed entirely. This test is
        // updated to match that already-committed shape; the underlying
        // property (shield-only pre-auth, no title/message/retry outside
        // an actual error) is unchanged.
        let lockScreenSource = try mobileAppSource(at: "src/components/app-lock-screen.tsx")
        XCTAssertFalse(lockScreenSource.contains("ActivityIndicator"), "the spinner was removed — no ActivityIndicator import/usage should remain")
        XCTAssertTrue(lockScreenSource.contains("variant === 'error'"), "non-shield-only content must be gated behind the error-variant check")

        // Bounded: the JSX guarded by that check is the ONLY place the
        // title/message/retry button are ever rendered — every other
        // variant renders nothing beyond the single, always-present
        // ShieldMark.
        let guardStart = try XCTUnwrap(lockScreenSource.range(of: "variant === 'error' ? ("))
        let shieldMarkRange = try XCTUnwrap(lockScreenSource.range(of: "<ShieldMark"))
        XCTAssertTrue(shieldMarkRange.upperBound < guardStart.lowerBound, "ShieldMark must render unconditionally, before the variant-gated content")

        let renderBodyBeforeGuard = lockScreenSource[shieldMarkRange.upperBound..<guardStart.lowerBound]
        for term in ["Unlock Mobile Wallet", "Authentication was cancelled", "Try Again"] {
            XCTAssertFalse(renderBodyBeforeGuard.contains(term), "\(term) must not render unconditionally / outside the error-only branch")
        }
    }

    // MARK: - Q: authError still renders the existing title/message/retry UI

    func testAuthErrorStillRendersExistingRetryUI() throws {
        let layoutSource = try mobileAppSource(at: "src/app/_layout.tsx")
        XCTAssertTrue(layoutSource.contains("phase.phase === 'authError' ? 'error'"))

        let lockScreenSource = try mobileAppSource(at: "src/components/app-lock-screen.tsx")
        XCTAssertTrue(lockScreenSource.contains("Text style={styles.title}>Unlock Mobile Wallet<"))
        XCTAssertTrue(lockScreenSource.contains("Authentication was cancelled or unsuccessful."))
        XCTAssertTrue(lockScreenSource.contains("accessibilityLabel=\"Try Again\""))
        XCTAssertTrue(lockScreenSource.contains("onPress={onRetry}"))
    }

    // MARK: - O: only the initial attempt is delayed; retry is immediate

    func testOnlyTheInitialAttemptIsDelayedRetryIsImmediate() throws {
        let source = try mobileAppSource(at: "src/app/_layout.tsx")

        let effectStart = try XCTUnwrap(source.range(of: "useEffect(() => {"))
        let effectEnd = try XCTUnwrap(source.range(of: "\n  }, [phase.phase]);", range: effectStart.upperBound..<source.endIndex))
        let effectBody = source[effectStart.upperBound..<effectEnd.lowerBound]

        // A one-shot flag, consumed once per component instance, decides
        // whether this 'locked' entry is the initial (delayed) attempt or
        // a retry (immediate) — never re-armed anywhere in the effect.
        XCTAssertTrue(effectBody.contains("const isInitialAttempt = isFirstAttemptRef.current;"))
        XCTAssertTrue(effectBody.contains("isFirstAttemptRef.current = false;"))
        XCTAssertEqual(
            effectBody.components(separatedBy: "isFirstAttemptRef.current = false").count - 1, 1,
            "isFirstAttemptRef must be consumed exactly once and never reset back to true"
        )

        // Only the initial-attempt branch is wrapped in the timer; the
        // non-initial (retry) path calls beginAuthentication() immediately,
        // with no delay.
        let ifStart = try XCTUnwrap(effectBody.range(of: "if (isInitialAttempt) {"))
        let ifEnd = try XCTUnwrap(effectBody.range(of: "\n    }", range: ifStart.upperBound..<effectBody.endIndex))
        let ifBody = effectBody[ifStart.upperBound..<ifEnd.lowerBound]
        XCTAssertTrue(ifBody.contains("setTimeout(beginAuthentication, INITIAL_UNLOCK_HOLD_MS)"))

        let afterIf = effectBody[ifEnd.upperBound...]
        XCTAssertTrue(afterIf.contains("beginAuthentication();"), "the non-initial (retry) path must call beginAuthentication() directly, unwrapped by any timer")

        // handleRetry itself never touches isFirstAttemptRef — it only ever
        // re-enters 'locked', relying on the effect above (already proven)
        // to correctly treat every re-entry after the first as immediate.
        let retryStart = try XCTUnwrap(source.range(of: "const handleRetry = useCallback(() => {"))
        let retryEnd = try XCTUnwrap(source.range(of: "\n  }, []);", range: retryStart.upperBound..<source.endIndex))
        let retryBody = source[retryStart.upperBound..<retryEnd.lowerBound]
        XCTAssertFalse(retryBody.contains("isFirstAttemptRef"), "retry must never reset the one-shot initial-attempt flag")
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
