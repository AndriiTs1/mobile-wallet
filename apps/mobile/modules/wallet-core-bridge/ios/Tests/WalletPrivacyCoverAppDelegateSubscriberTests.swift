import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5F.5B-Native: tests for the native iOS App Switcher / multitasking-
/// snapshot privacy cover (`WalletPrivacyCoverAppDelegateSubscriber.swift`).
///
/// Consistent with this project's whole existing methodology, these are
/// structural source audits — they prove the code's shape, scope, and
/// isolation from auth/wallet APIs, NOT actual iOS snapshot-capture timing.
/// Whether the app-switcher preview genuinely never shows Home content, and
/// whether the native-to-RN-cover handoff is visually seamless, can only be
/// confirmed by physical-iPhone QA — no XCTest run, on simulator or
/// otherwise, can observe the OS compositor's own snapshot behavior.
final class WalletPrivacyCoverAppDelegateSubscriberTests: XCTestCase {
    // MARK: - 1: conforms to ExpoAppDelegateSubscriber

    func testSubscriberConformsToExpoAppDelegateSubscriber() throws {
        let source = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")
        XCTAssertTrue(source.contains("class WalletPrivacyCoverAppDelegateSubscriber: ExpoAppDelegateSubscriber {"))
    }

    // MARK: - 2/3: implements both required lifecycle callbacks

    func testImplementsBothRequiredLifecycleCallbacks() throws {
        let source = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")
        XCTAssertTrue(source.contains("func applicationWillResignActive(_ application: UIApplication) {"))
        XCTAssertTrue(source.contains("func applicationDidBecomeActive(_ application: UIApplication) {"))
    }

    // MARK: - 4: cover is installed during willResignActive

    func testCoverIsInstalledDuringWillResignActive() throws {
        let source = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")
        let start = try XCTUnwrap(source.range(of: "func applicationWillResignActive(_ application: UIApplication) {"))
        let end = try XCTUnwrap(source.range(of: "\n  }", range: start.upperBound..<source.endIndex))
        let body = source[start.upperBound..<end.lowerBound]
        XCTAssertTrue(body.contains("window.addSubview(cover)"))
        XCTAssertTrue(body.contains("coverView = cover"))
    }

    // MARK: - 5: cover is removed during didBecomeActive

    func testCoverIsRemovedDuringDidBecomeActive() throws {
        let source = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")
        let start = try XCTUnwrap(source.range(of: "func applicationDidBecomeActive(_ application: UIApplication) {"))
        let end = try XCTUnwrap(source.range(of: "\n  }", range: start.upperBound..<source.endIndex))
        let body = source[start.upperBound..<end.lowerBound]
        XCTAssertTrue(body.contains("cover.removeFromSuperview()"))
        XCTAssertTrue(body.contains("coverView = nil"))
    }

    // MARK: - 6: dark fallback works independently of UIImage availability

    func testDarkBackgroundIsSetUnconditionallyBeforeImageAttempt() throws {
        let source = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")

        let colorRange = try XCTUnwrap(source.range(of: "cover.backgroundColor = Self.coverBackgroundColor"))
        let imageAttemptRange = try XCTUnwrap(source.range(of: "if let shieldImage = UIImage(named:"))
        XCTAssertTrue(
            colorRange.upperBound < imageAttemptRange.lowerBound,
            "the dark background must be set before any attempt to load the shield image, so it applies regardless of image availability"
        )

        // Installing the cover into the window must also be unconditional —
        // outside/after the image-loading `if let` block, never depending
        // on it having succeeded.
        let ifStart = try XCTUnwrap(source.range(of: "if let shieldImage = UIImage(named: Self.shieldImageName) {"))
        let ifEnd = try XCTUnwrap(source.range(of: "\n    }", range: ifStart.upperBound..<source.endIndex))
        let addSubviewRange = try XCTUnwrap(source.range(of: "window.addSubview(cover)"))
        XCTAssertTrue(
            addSubviewRange.lowerBound > ifEnd.upperBound,
            "installing the cover must happen after (outside) the image-loading if-block"
        )
    }

    // MARK: - 7: no force unwrap of the shield image

    func testNoForceUnwrapOfShieldImage() throws {
        let source = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")
        XCTAssertFalse(source.contains("UIImage(named: Self.shieldImageName)!"))
        XCTAssertTrue(source.contains("if let shieldImage = UIImage(named: Self.shieldImageName) {"))
    }

    // MARK: - 8: no wallet/auth/secret APIs referenced

    func testNoWalletAuthOrSecretAPIsReferenced() throws {
        let source = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")
        for term in [
            "WalletSecureStorage", "WalletBiometricAuthorizer", "requestAppUnlock", "requestRevealBackup",
            "mnemonic", "entropy", "seed", "privateKey", "xpriv",
            "authToken", "authState", "RCTBridge", "React",
        ] {
            XCTAssertFalse(source.contains(term), "WalletPrivacyCoverAppDelegateSubscriber.swift must not reference \(term)")
        }
    }

    // MARK: - 9: registered in expo-module.config.json

    func testRegisteredInExpoModuleConfig() throws {
        let configURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // WalletPrivacyCoverAppDelegateSubscriberTests.swift -> Tests/
            .deletingLastPathComponent() // Tests/ -> ios/
            .deletingLastPathComponent() // ios/ -> wallet-core-bridge/
            .appendingPathComponent("expo-module.config.json")
        let configSource = try String(contentsOf: configURL, encoding: .utf8)
        XCTAssertTrue(configSource.contains("\"appDelegateSubscribers\": [\"WalletPrivacyCoverAppDelegateSubscriber\"]"))
    }

    // MARK: - 10: no second UIWindow is created

    func testNoSecondUIWindowIsCreated() throws {
        let source = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")
        XCTAssertFalse(source.contains("UIWindow("), "must attach to the existing key window, never construct a new UIWindow")
    }

    // MARK: - 10b: key window is resolved via the non-deprecated
    // connectedScenes API, not the deprecated UIApplication.windows

    func testKeyWindowIsResolvedViaConnectedScenesNotDeprecatedApplicationWindows() throws {
        let source = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")
        XCTAssertFalse(source.contains("application.windows"), "must not use the deprecated (iOS 15+) UIApplication.windows lookup")
        XCTAssertTrue(source.contains("UIApplication.shared.connectedScenes"))
        XCTAssertTrue(source.contains("compactMap { $0 as? UIWindowScene }"))
        XCTAssertTrue(source.contains("guard let window = Self.keyWindow() else {"))
    }

    // MARK: - 11: no timer/delay is introduced

    func testNoTimerOrDelayIntroduced() throws {
        let source = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")
        for term in ["Timer(", "Timer.scheduledTimer", "DispatchQueue.main.asyncAfter", "asyncAfter(", "Thread.sleep", "usleep("] {
            XCTAssertFalse(source.contains(term), "WalletPrivacyCoverAppDelegateSubscriber.swift must not contain \(term)")
        }
    }

    // MARK: - 12: existing RN AppLockGate/PrivacyCover remain unchanged by
    // this implementation turn

    /// Regression guard, not a diff — asserts the already-established
    /// Stage 5F.5A/5F.5B RN markers this implementation turn was explicitly
    /// forbidden from touching are still present verbatim.
    func testExistingRNAppLockGateAndPrivacyCoverRemainUnchanged() throws {
        let layoutSource = try mobileAppSource(at: "src/app/_layout.tsx")
        XCTAssertTrue(layoutSource.contains("const BACKGROUND_GRACE_PERIOD_MS = 15_000;"))
        XCTAssertTrue(layoutSource.contains("const INITIAL_UNLOCK_HOLD_MS = 1000;"))
        XCTAssertTrue(layoutSource.contains("if (nextState === 'inactive') {"))
        XCTAssertTrue(layoutSource.contains("setIsPrivacyCoverVisible(true);"))
        XCTAssertTrue(layoutSource.contains("<PrivacyCover />"))

        let privacyCoverSource = try mobileAppSource(at: "src/components/privacy-cover.tsx")
        XCTAssertTrue(privacyCoverSource.contains("export function PrivacyCover()"))
        // The shield size is now sourced from a single shared constant
        // (`ShieldLogoSize`, `constants/theme.ts`) rather than a repeated
        // literal, specifically to prevent this file drifting out of sync
        // with `AppLockScreen`'s own shield size again.
        XCTAssertTrue(privacyCoverSource.contains("<ShieldMark size={ShieldLogoSize} />"))
    }

    // MARK: - 13: canonical shield artwork/geometry is consistent across
    // the whole cold-launch/privacy-cover pipeline

    /// Proves the shield-geometry audit's fix: the SAME zero-padding
    /// `shield-mark.png` artwork is used consistently across the native
    /// Expo launch splash (`app.json`), `AnimatedSplashOverlay`,
    /// `AppLockScreen`, `PrivacyCover`, and this native subscriber — not
    /// merely matching raw numeric constants, which alone would NOT
    /// guarantee identical visible geometry. Direct alpha-bounding-box
    /// measurement (recorded in this stage's own audit) showed
    /// `splash-icon.png` bakes in ~11% transparent padding that
    /// `expo-image`'s default `contentFit` ('cover') would scale along
    /// with the artwork, and that `SplashScreenLogo`'s own square-canvas
    /// export shape requires a square (not artwork-sized) native
    /// constraint box to render undistorted — this test guards both fixes
    /// structurally.
    func testCanonicalShieldArtworkIsConsistentAcrossThePipeline() throws {
        let appJsonSource = try mobileAppSource(at: "app.json")
        XCTAssertTrue(appJsonSource.contains("\"image\": \"./assets/images/shield-mark@3x.png\""))
        XCTAssertTrue(appJsonSource.contains("\"imageWidth\": 90"))

        let animatedIconSource = try mobileAppSource(at: "src/components/animated-icon.tsx")
        XCTAssertFalse(animatedIconSource.contains("splash-icon.png"), "AnimatedSplashOverlay must no longer render the padded splash-icon.png source")
        XCTAssertTrue(animatedIconSource.contains("<ShieldMark size={ShieldLogoSize} />"))

        let subscriberSource = try codeOnlySource(of: "WalletPrivacyCoverAppDelegateSubscriber.swift")
        XCTAssertTrue(subscriberSource.contains("private static let shieldContainerSize: CGFloat = 90"))
        XCTAssertTrue(subscriberSource.contains("imageView.widthAnchor.constraint(equalToConstant: Self.shieldContainerSize)"))
        XCTAssertTrue(subscriberSource.contains("imageView.heightAnchor.constraint(equalToConstant: Self.shieldContainerSize)"))
        XCTAssertFalse(subscriberSource.contains("UIImage(named: Self.shieldImageName)!"), "still no force unwrap of the shield image")
    }

    // MARK: - Helpers

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
